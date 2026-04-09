/*
 * Copyright (C) 2026 Stateless Research Ltd
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 * Commercial licenses: https://statelessresearch.com/
 */
export class SigningRoomElement extends HTMLElement {
    private iframe: HTMLIFrameElement;
    private targetOrigin: string = '';
    private messageListener?: (event: MessageEvent) => void;
    
    private _isReady = false;
    private _queuedPsbt: string | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' }); 
        
        this.iframe = document.createElement('iframe');
        this.iframe.style.width = '100%';
        this.iframe.style.height = '100%';
        this.iframe.style.minHeight = '600px'; 
        this.iframe.style.border = 'none';
        this.iframe.style.borderRadius = '12px';
        this.iframe.allow = 'clipboard-write'; 
    }

    connectedCallback() {
        const rawOrigin = this.getAttribute('relay-endpoint') || 'https://signingroom.io';
        this.targetOrigin = rawOrigin.replace(/\/$/, '');
        
        const network = this.getAttribute('network') || 'bitcoin';
        const roomId = this.getAttribute('room-id');
        const key = this.getAttribute('decryption-key');
        const view = this.getAttribute('view');
        
        const hideHeader = this.getAttribute('hide-header') === 'true';
        
        const hostOrigin = encodeURIComponent(window.location.origin);
        
        let src = `${this.targetOrigin}/create?embedded=true&network=${network}&host=${hostOrigin}&hideHeader=${hideHeader}`;
        
        if (view) src += `&view=${view}`;
        if (roomId) {
            src = `${this.targetOrigin}/room/${roomId}?embedded=true&host=${hostOrigin}&hideHeader=${hideHeader}`;
            if (key) src += `#${key}`;
        }
        
        this.iframe.src = src;
        this.shadowRoot?.appendChild(this.iframe);

        this.messageListener = this.handleMessage.bind(this);
        window.addEventListener('message', this.messageListener);
    }

    loadPsbt(psbtBase64: string) {
        if (this._isReady && this.iframe.contentWindow) {
            this.iframe.contentWindow.postMessage({
                type: 'SIGNING_ROOM_COMMAND',
                action: 'LOAD_PSBT',
                payload: psbtBase64
            }, this.targetOrigin);
        } else {
            this._queuedPsbt = psbtBase64;
        }
    }

    disconnectedCallback() {
        if (this.messageListener) {
            window.removeEventListener('message', this.messageListener);
        }
    }

    handleMessage(event: MessageEvent) {
        if (event.origin !== this.targetOrigin) return;

        const { type, action, payload } = event.data || {};
        
        if (type === 'SIGNING_ROOM_EVENT' && action) {
            
            if (action === 'WIDGET_READY') {
                this._isReady = true;
                if (this._queuedPsbt) {
                    this.loadPsbt(this._queuedPsbt);
                    this._queuedPsbt = null;
                }
            }

            this.dispatchEvent(new CustomEvent(action, { 
                detail: payload,
                bubbles: true,
                composed: true 
            }));
        }
    }
}

if (typeof window !== 'undefined' && typeof customElements !== 'undefined' && !customElements.get('signing-room')) {
    customElements.define('signing-room', SigningRoomElement);
}