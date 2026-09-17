import { registerPlugin, Capacitor } from '@capacitor/core'

// Voice in: native on-device speech recognition when running as the iOS
// app (see ios/App/App/SpeechPlugin.swift — a first-party plugin wrapping
// Apple's Speech framework, no third-party dependency). Falls back to the
// browser's Web Speech API when available (desktop Chrome/Edge during
// development) — plain unsupported/disabled everywhere else, most notably
// Mobile Safari/WKWebView when NOT running through the native plugin,
// which is why the native path exists at all.
//
// Voice out: the Web Speech Synthesis API (`speechSynthesis`) is natively
// supported in WKWebView on iOS, so no native plugin is needed for the
// assistant to talk back.

interface MeridianSpeechPlugin {
  requestSpeechPermissions(): Promise<{ granted: boolean }>
  start(): Promise<void>
  stop(): Promise<void>
  addListener(
    eventName: 'transcript',
    listenerFunc: (data: { text: string; isFinal: boolean }) => void
  ): Promise<{ remove: () => void }>
}

const NativeSpeech = registerPlugin<MeridianSpeechPlugin>('MeridianSpeech')

export type VoiceInputSupport = 'native' | 'web' | 'none'

export function voiceInputSupport(): VoiceInputSupport {
  if (Capacitor.isNativePlatform()) return 'native'
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  if (w.SpeechRecognition || w.webkitSpeechRecognition) return 'web'
  return 'none'
}

export async function requestVoiceInputPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { granted } = await NativeSpeech.requestSpeechPermissions()
    return granted
  }
  return voiceInputSupport() === 'web'
}

/**
 * Starts listening and streams transcript updates to `onTranscript` until
 * `stop()` (the returned function) is called or a final result arrives.
 */
export function startListening(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError?: (message: string) => void
): () => void {
  if (Capacitor.isNativePlatform()) {
    let removed = false
    const listenerPromise = NativeSpeech.addListener('transcript', (data) => onTranscript(data.text, data.isFinal))
    NativeSpeech.start().catch((err) => onError?.(err instanceof Error ? err.message : String(err)))
    return () => {
      if (removed) return
      removed = true
      void NativeSpeech.stop()
      void listenerPromise.then((h) => h.remove())
    }
  }

  const w = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }
  const Impl = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Impl) {
    onError?.('Voice input is not supported in this browser.')
    return () => {}
  }
  const recognition = new Impl()
  recognition.continuous = false
  recognition.interimResults = true
  recognition.lang = 'en-US'
  recognition.onresult = (event: any) => {
    const result = event.results[event.results.length - 1]
    onTranscript(result[0].transcript, result.isFinal)
  }
  recognition.onerror = (event: any) => onError?.(event.error ?? 'Voice input error')
  recognition.start()
  return () => recognition.stop()
}

export function speak(text: string) {
  if (!('speechSynthesis' in window) || !text.trim()) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.02
  utterance.pitch = 1
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
