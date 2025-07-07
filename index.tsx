
/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session, SpeechConfig} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

interface LiveSessionConfig {
  responseModalities?: Modality[];
  speechConfig?: SpeechConfig;
  systemInstruction?: string;
}

interface VoiceOption {
  name: string;
  value: string;
}

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() customSystemPrompt: string = '';
  @state() tempSystemPrompt: string = '';
  @state() selectedVoice: string = 'Orus'; // Default voice
  @state() tempSelectedVoice: string = 'Orus';
  @state() isConfigPanelVisible: boolean = false;

  private client: GoogleGenAI;
  private session: Session;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  private availableVoices: VoiceOption[] = [
    { name: 'Zephyr Alegre (Bright)', value: 'Zephyr' },
    { name: 'Puck Animado (Upbeat)', value: 'Puck' },
    { name: 'Charon Informativo (Informative)', value: 'Charon' },
    { name: 'Kore Firme (Firm)', value: 'Kore' },
    { name: 'Fenrir Animado/Excitável (Excitable)', value: 'Fenrir' },
    { name: 'Leda Jovem (Youthful)', value: 'Leda' },
    { name: 'Orus Firme (Firm)', value: 'Orus' },
    { name: 'Aoede Leve/Descontraído (Breezy)', value: 'Aoede' },
    { name: 'Callirrhoe Tranquilo (Easy-going)', value: 'Callirrhoe' },
    { name: 'Autonoe Alegre (Bright)', value: 'Autonoe' },
    { name: 'Enceladus Sussurrante/Com respiração (Breathy)', value: 'Enceladus' },
    { name: 'Iapetus Claro (Clear)', value: 'Iapetus' },
    { name: 'Umbriel Tranquilo (Easy-going)', value: 'Umbriel' },
    { name: 'Algieba Suave (Smooth)', value: 'Algieba' },
    { name: 'Despina Suave (Smooth)', value: 'Despina' },
    { name: 'Erinome Claro (Clear)', value: 'Erinome' },
    { name: 'Algenib Rouco (Gravelly)', value: 'Algenib' },
    { name: 'Rasalgethi Informativo (Informative)', value: 'Rasalgethi' },
    { name: 'Laomedeia Animado (Upbeat)', value: 'Laomedeia' },
    { name: 'Achernar Suave (Soft)', value: 'Achernar' },
    { name: 'Alnilam Firme (Firm)', value: 'Alnilam' },
    { name: 'Schedar Equilibrado (Even)', value: 'Schedar' },
    { name: 'Gacrux Maduro (Mature)', value: 'Gacrux' },
    { name: 'Pulcherrima Direto (Forward)', value: 'Pulcherrima' },
    { name: 'Achird Amigável (Friendly)', value: 'Achird' },
    { name: 'Zubenelgenubi Casual (Casual)', value: 'Zubenelgenubi' },
    { name: 'Vindemiatrix Gentil (Gentle)', value: 'Vindemiatrix' },
    { name: 'Sadachbia Vibrante (Lively)', value: 'Sadachbia' },
    { name: 'Sadaltager Conhecedor (Knowledgeable)', value: 'Sadaltager' },
    { name: 'Sulafat Caloroso (Warm)', value: 'Sulafat' }
  ];

  static styles = css`
    :host {
      display: block;
      width: 100%; /* Take full width of parent */
      height: 100%; /* Take full height of parent */
      position: relative; /* Establish stacking context */
      overflow: hidden; /* Prevent content from causing scrollbars on :host */
    }

    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
      font-family: 'Roboto', sans-serif;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: row; /* Changed to row for horizontal layout */
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        display: flex; /* For aligning icon */
        align-items: center; /* For aligning icon */
        justify-content: center; /* For aligning icon */

        svg {
          pointer-events: none; /* Ensure clicks on SVG are handled by the button */
        }

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
      button#startButton[disabled], button#stopButton[disabled], button#resetButton[disabled] {
         /* Original logic to hide specific buttons if needed, but opacity is often better than display:none for layout stability */
      }
    }

    .config-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      font-family: 'Roboto', sans-serif;
    }

    .config-panel {
      background-color: #2c2c2e;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
      width: 90%;
      max-width: 500px;
      color: white;
    }

    .config-panel h2 {
      margin-top: 0;
      margin-bottom: 20px;
      font-size: 1.5em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      padding-bottom: 10px;
    }

    .config-panel label {
      display: block;
      margin-bottom: 8px;
      font-size: 0.9em;
      color: #b0b0b0;
    }

    .config-panel textarea, .config-panel select {
      width: calc(100% - 22px); /* Account for padding */
      padding: 10px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      background-color: #3a3a3c;
      color: white;
      font-size: 1em;
      margin-bottom: 20px;
      font-family: inherit;
    }
    
    .config-panel textarea {
      min-height: 100px;
      resize: vertical;
    }

    .config-panel select {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23b0b0b0%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.4-5.4-12.8z%22/%3E%3C/svg%3E');
      background-repeat: no-repeat;
      background-position: right 10px center;
      background-size: 12px;
    }


    .config-panel .buttons {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    .config-panel button {
      padding: 10px 20px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 1em;
      transition: background-color 0.2s;
    }

    .config-panel .apply-button {
      background-color: #007aff;
      color: white;
    }
    .config-panel .apply-button:hover {
      background-color: #005ecb;
    }

    .config-panel .cancel-button {
      background-color: #555;
      color: white;
    }
    .config-panel .cancel-button:hover {
      background-color: #444;
    }

    /* Hide disabled buttons if a more prominent "disabled" state isn't enough */
    button[disabled].hide-when-disabled {
        display: none;
    }

  `;

  constructor() {
    super();
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY, 
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';

    const sessionConfig: LiveSessionConfig = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {prebuiltVoiceConfig: {voiceName: this.selectedVoice}},
        // languageCode: 'en-GB' // Example, could be 'pt-BR' for Brazilian Portuguese
      },
    };

    if (this.customSystemPrompt && this.customSystemPrompt.trim() !== '') {
      sessionConfig.systemInstruction = this.customSystemPrompt;
    }

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Sessão Aberta');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () =>{
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if(interrupted) {
              for(const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(`Erro: ${e.message}`);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus(`Sessão Fechada: ${e.reason || 'Nenhum motivo fornecido'}`);
          },
        },
        config: sessionConfig,
      });
      this.updateStatus('Sessão inicializada.');
      if (this.customSystemPrompt || this.selectedVoice !== 'Orus') { // Check if default voice changed
        this.updateStatus(`Sessão inicializada com configurações personalizadas.`);
      }
    } catch (e) {
      console.error(e);
      this.updateError(`Falha ao inicializar sessão: ${e.message}`);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
    this.error = ''; // Clear previous errors when a new status comes in
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    if (!this.session || this.session['isClosed'] ) { 
        this.updateStatus('Sessão está fechada. Reinicializando...');
        await this.initSession();
        if (!this.session || this.session['isClosed']) {
            this.updateError('Falha ao iniciar sessão. Não é possível gravar.');
            return;
        }
    }


    this.inputAudioContext.resume();

    this.updateStatus('Solicitando acesso ao microfone...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Acesso ao microfone concedido. Iniciando captura...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording || !this.session) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);
        try {
            this.session.sendRealtimeInput({media: createBlob(pcmData)});
        } catch (err) {
            console.error('Erro ao enviar dados de áudio:', err);
            this.updateError(`Erro ao enviar áudio: ${err.message}`);
        }
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination); 

      this.isRecording = true;
      this.updateStatus('🔴 Gravando... Capturando áudio.');
    } catch (err) {
      console.error('Erro ao iniciar gravação:', err);
      this.updateStatus(`Erro ao iniciar gravação: ${err.message}`);
      this.stopRecording(); 
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext) {
      if (this.isRecording) this.isRecording = false; 
      return;
    }


    this.isRecording = false; 

    if (this.scriptProcessorNode) {
        this.scriptProcessorNode.disconnect();
        this.scriptProcessorNode.onaudioprocess = null; 
        this.scriptProcessorNode = null;
    }
    if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    
    this.updateStatus('Gravação parada. Clique em Iniciar para começar novamente.');
  }

  private reset() {
    this.stopRecording(); 
    if (this.session) {
        try {
            this.session.close();
        } catch (e) {
            console.warn("Erro ao fechar sessão durante reinicialização:", e);
        }
        this.session = null;
    }
    this.initSession(); 
    this.updateStatus('Sessão reiniciada.');
    if (this.customSystemPrompt || this.selectedVoice !== 'Orus') {
      this.updateStatus('Sessão reiniciada com as configurações personalizadas atuais.');
    }
  }

  private toggleConfigPanel() {
    this.isConfigPanelVisible = !this.isConfigPanelVisible;
    if (this.isConfigPanelVisible) {
      this.tempSystemPrompt = this.customSystemPrompt;
      this.tempSelectedVoice = this.selectedVoice; 
    }
  }

  private handleSystemPromptChange(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    this.tempSystemPrompt = textarea.value;
  }

  private handleVoiceChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.tempSelectedVoice = select.value;
  }

  private applyConfigAndReset() {
    this.customSystemPrompt = this.tempSystemPrompt;
    this.selectedVoice = this.tempSelectedVoice;
    this.isConfigPanelVisible = false;
    this.reset(); 
    this.updateStatus('Configurações aplicadas. Sessão reiniciada.');
  }

  renderConfigPanel() {
    if (!this.isConfigPanelVisible) {
      return html``;
    }
    return html`
      <div class="config-overlay" @click=${(e: MouseEvent) => { if (e.target === e.currentTarget) this.toggleConfigPanel(); }}>
        <div class="config-panel" role="dialog" aria-modal="true" aria-labelledby="config-panel-title">
          <h2 id="config-panel-title">Configuração do Agente</h2>
          <div>
            <label for="system-prompt-textarea">Prompt de Sistema Personalizado:</label>
            <textarea
              id="system-prompt-textarea"
              .value=${this.tempSystemPrompt}
              @input=${this.handleSystemPromptChange}
              placeholder="Ex: Você é um assistente amigável e prestativo."></textarea>
          </div>
          <div>
            <label for="voice-select">Voz do Agente:</label>
            <select
              id="voice-select"
              .value=${this.tempSelectedVoice}
              @change=${this.handleVoiceChange}>
              ${this.availableVoices.map(voice => html`
                <option value=${voice.value} ?selected=${voice.value === this.tempSelectedVoice}>${voice.name}</option>
              `)}
            </select>
          </div>
          <div class="buttons">
            <button class="cancel-button" @click=${this.toggleConfigPanel}>Cancelar</button>
            <button class="apply-button" @click=${this.applyConfigAndReset}>Aplicar e Reiniciar Sessão</button>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="app-root-container">
        <div class="controls">
           <button
            id="settingsButton"
            @click=${this.toggleConfigPanel}
            title="Configurações"
            aria-label="Abrir painel de configurações">
            <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 0 24 24" width="32px" fill="currentColor">
              <path d="M0 0h24v24H0V0z" fill="none"/>
              <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
            </svg>
          </button>
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}
            class=${this.isRecording ? '' : 'hide-when-disabled-visual-cue'} 
            title="Reiniciar Sessão"
            aria-label="Reiniciar Sessão">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="32px"
              viewBox="0 -960 960 960"
              width="32px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}
            class=${this.isRecording ? 'hide-when-disabled' : ''}
            title="Conversar"
            aria-label="Conversar">
             <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 0 24 24" width="32px" fill="#c80000">
                <path d="M0 0h24v24H0V0z" fill="none"/>
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}
            class=${!this.isRecording ? 'hide-when-disabled' : ''}
            title="Parar Gravação"
            aria-label="Parar Gravação">
            <svg
              viewBox="0 0 100 100"
              width="28px" /* Slightly smaller to match visual weight of circle */
              height="28px"
              fill="#ffffff" /* Changed to white for better contrast on dark buttons */
              xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="5" width="90" height="90" rx="10" />
            </svg>
          </button>
        </div>

        <div id="status" role="status" aria-live="polite">
          ${this.error ? this.error : this.status}
        </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
        ${this.renderConfigPanel()}
      </div>
    `;
  }
}
