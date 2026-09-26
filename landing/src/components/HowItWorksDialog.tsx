import { useEffect, useRef, useState } from 'react'

const STAGES = [
  { name: 'Terms', title: 'Set the condition.', description: 'Choose the amount, recipient and release rule.', projection: 'Rule defined' },
  { name: 'Wallet', title: 'Review. Sign.', description: 'Your wallet authorizes the transaction. Wait for Stellar’s confirmation.', projection: 'Signature required' },
  { name: 'Result', title: 'Prove. Confirm.', description: 'Claims and refunds require a transaction. Check its confirmed result.', projection: 'Confirmation required' },
] as const

export default function HowItWorksDialog({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const [selected, setSelected] = useState(0)
  const stage = STAGES[selected]

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      element.showModal()
      close.current?.focus({ preventScroll: true })
    } else if (!open && element.open) {
      element.close()
      const previous = returnFocus.current
      const menuToggle = document.querySelector<HTMLButtonElement>('.orbital-nav__toggle')
      if (previous?.isConnected && previous !== document.body && previous.getClientRects().length && getComputedStyle(previous).visibility !== 'hidden') previous.focus({ preventScroll: true })
      else if (menuToggle?.getClientRects().length) menuToggle.focus({ preventScroll: true })
      else document.getElementById('home')?.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    const element = dialog.current
    return () => { if (element?.open) element.close() }
  }, [])

  return (
    <dialog id="how-it-works-dialog" className="immersive-how" data-stage={selected} ref={dialog} aria-labelledby="mechanism-title" onCancel={event => { event.preventDefault(); onDismiss() }} onKeyDown={event => {
      if (event.key !== 'Tab') return
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }} onClick={event => {
      if (event.target !== event.currentTarget) return
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onDismiss()
    }}>
      <header><h2 id="mechanism-title">How it works</h2><button type="button" ref={close} onClick={onDismiss}>Close <span aria-hidden="true">×</span></button></header>
      <div className="mechanism-optics" aria-hidden="true">
        <svg viewBox="0 0 720 230" fill="none">
          <defs><linearGradient id="mechanism-light"><stop stopColor="#f3b477" /><stop offset="1" stopColor="#d6edff" /></linearGradient></defs>
          <path className="mechanism-optics__axis" d="M20 115H700M160 28V204M360 14V216M562 28V204" />
          <g className="mechanism-optics__beam" key={selected}>
            <path className="mechanism-optics__cone" d="M38 115L160 65L360 89L565 39V191L360 141L160 165Z" />
            <path className="mechanism-optics__ray" d="M38 115L160 65L360 89L565 39M38 115H565M38 115L160 165L360 141L565 191" />
          </g>
          <g className="mechanism-optics__terms"><path d="M128 62L166 45L192 58V170L153 188L128 174Z" /><path d="M153 77L192 58M153 77L128 62M153 77V188M138 97L145 101M138 115L145 119M166 93L179 87M166 112L179 106M166 131L179 125M166 150L179 144" /><circle cx="153" cy="77" r="4" /></g>
          <g className="mechanism-optics__wallet"><ellipse cx="360" cy="115" rx="53" ry="87" /><ellipse cx="360" cy="115" rx="35" ry="72" /><path d="M326 114L349 139L394 88M307 115H285M413 115H435M360 28V12M360 202V218" /><circle cx="360" cy="115" r="104" strokeDasharray="2 13" /></g>
          <g className="mechanism-optics__result"><path d="M534 49L577 30L609 44V183L568 202L534 187ZM568 66L609 44M568 66V202M568 66L534 49M578 90L599 81M578 109L599 100M578 145L599 136M578 164L593 158" /><path d="M543 90L558 96M543 109L558 115M543 145L558 151M543 164L558 170" /><path d="M622 81H659M622 115H680M622 149H659" /></g>
          <circle className="mechanism-optics__source" cx="38" cy="115" r="5" />
        </svg>
        <div className="mechanism-optics__projection"><span>0{selected + 1}</span><span>{stage.projection}</span></div>
      </div>
      <div className="mechanism-tabs" role="tablist" aria-label="Transaction stages">
        {STAGES.map((item, index) => <button key={item.name} id={`mechanism-tab-${index}`} ref={element => { tabs.current[index] = element }} type="button" role="tab" aria-selected={selected === index} aria-controls={`mechanism-panel-${index}`} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => {
          let next = index
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % STAGES.length
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + STAGES.length - 1) % STAGES.length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = STAGES.length - 1
          else return
          event.preventDefault()
          setSelected(next)
          tabs.current[next]?.focus()
        }}><span aria-hidden="true">0{index + 1}</span><span className="mechanism-tab__label">{item.name}</span><i aria-hidden="true">↗</i></button>)}
      </div>
      {STAGES.map((item, index) => <section className="mechanism-panel" key={item.name} id={`mechanism-panel-${index}`} role="tabpanel" tabIndex={0} aria-labelledby={`mechanism-tab-${index}`} hidden={selected !== index}><h3>{item.title}</h3><p>{item.description}</p></section>)}
    </dialog>
  )
}
