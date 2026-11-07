/** Host (chat app) side: owns one iframe and answers its handshake. */
import { NS, PROTOCOL_VERSION, isNsMessage, type AppMessage, type HostMessage, type MiniAppInit, type MiniAppSession, type MiniAppTheme } from './protocol'

export { PROTOCOL_VERSION }

export interface HostOptions {
  iframe: HTMLIFrameElement
  /** Origin of the mini app URL. Tokens are only ever posted to this origin. */
  appOrigin: string
  getInit: () => MiniAppInit
  onReady?: () => void
  onClose?: () => void
  onHaptic?: (kind: string) => void
}

export class MiniAppHost {
  private ready = false
  private readonly listener: (e: MessageEvent) => void

  constructor(private readonly opts: HostOptions) {
    this.listener = (e) => this.handle(e)
    window.addEventListener('message', this.listener)
  }

  private handle(e: MessageEvent) {
    if (e.source !== this.opts.iframe.contentWindow || e.origin !== this.opts.appOrigin) return
    if (!isNsMessage(e.data)) return
    const msg = e.data as AppMessage
    switch (msg.type) {
      case 'ready':
        this.ready = true
        this.send({ ns: NS, type: 'init', payload: this.opts.getInit() })
        this.opts.onReady?.()
        break
      case 'close':
        this.opts.onClose?.()
        break
      case 'haptic':
        this.opts.onHaptic?.(msg.payload)
        break
    }
  }

  private send(msg: HostMessage) {
    this.opts.iframe.contentWindow?.postMessage(msg, this.opts.appOrigin)
  }

  updateSession(session: MiniAppSession) {
    if (this.ready) this.send({ ns: NS, type: 'session', payload: session })
  }

  updateTheme(theme: MiniAppTheme) {
    if (this.ready) this.send({ ns: NS, type: 'theme', payload: theme })
  }

  updateLocale(locale: 'en' | 'vi') {
    if (this.ready) this.send({ ns: NS, type: 'locale', payload: locale })
  }

  destroy() {
    window.removeEventListener('message', this.listener)
  }
}
