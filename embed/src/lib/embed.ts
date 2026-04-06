export class SigningRoomElement extends HTMLElement {
    private iframe: HTMLIFrameElement;
    private targetOrigin: string;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' }); 
        
        this.targetOrigin = this.getAttribute('relay-endpoint') || 'https://app.signingroom.io';

        // 1. Create the iframe
        this.iframe = document.createElement('iframe');
        this.iframe.style.width = '100%';
        this.iframe.style.height = '100%';
        this.iframe.style.minHeight = '600px'; 
        this.iframe.style.border = 'none';
        this.iframe.style.borderRadius = '12px';
        this.iframe.allow = 'clipboard-write'; 
    }

    onnectedCallback() {
        const network = this.getAttribute('network') || 'bitcoin';
        const roomId = this.getAttribute('room-id');
        const key = this.getAttribute('decryption-key');
        
        let src = `${this.targetOrigin}/create?embedded=true&network=${network}`;
        
        if (roomId) {
            src = `${this.targetOrigin}/room/${roomId}?embedded=true`;
            if (key) src += `#${key}`;
        }
        
        this.iframe.src = src;
        this.shadowRoot?.appendChild(this.iframe);

        window.addEventListener('message', this.handleMessage.bind(this));
    }

    public loadPsbt(psbtBase64: string) {
        if (!this.iframe.contentWindow) return;
        
        // Inject the massive PSBT directly into the iframe's memory securely
        this.iframe.contentWindow.postMessage({
            type: 'SIGNING_ROOM_COMMAND',
            action: 'LOAD_PSBT',
            payload: psbtBase64
        }, this.targetOrigin);
    }

    disconnectedCallback() {
        window.removeEventListener('message', this.handleMessage.bind(this));
    }

    private handleMessage(event: MessageEvent) {
        // SECURITY: Only trust messages from your official Angular app's origin
        if (event.origin !== this.targetOrigin) return;

        const { type, action, payload } = event.data || {};
        
        if (type === 'SIGNING_ROOM_EVENT' && action) {
            // Re-emit as a standard DOM Custom Event so the host app can listen to it
            this.dispatchEvent(new CustomEvent(action, { 
                detail: payload,
                bubbles: true,
                composed: true // Allows event to pierce the shadow DOM boundary
            }));
        }
    }
}

// Register the custom element globally
if (typeof customElements !== 'undefined' && !customElements.get('signing-room')) {
    customElements.define('signing-room', SigningRoomElement);
}