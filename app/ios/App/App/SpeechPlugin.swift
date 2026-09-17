import Foundation
import Capacitor
import Speech
import AVFoundation

// A small first-party Capacitor plugin wrapping Apple's on-device Speech
// framework, so the assistant's "push to talk" mic works natively — no
// third-party CocoaPods dependency (which would conflict with this
// project's Swift-Package-Manager Capacitor setup).
//
// JS side: `Capacitor.registerPlugin('MeridianSpeech')`, see src/lib/voice.ts.
@objc(MeridianSpeechPlugin)
public class MeridianSpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MeridianSpeechPlugin"
    public let jsName = "MeridianSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestSpeechPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    // Named requestSpeechPermissions rather than requestPermissions: the
    // latter collides with a method CAPPlugin's own base class already
    // declares (Capacitor's declarative permissions API), which needs
    // `override` and public visibility to redeclare — simplest to just
    // not collide with it since we don't use that system here.
    @objc func requestSpeechPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { speechStatus in
            AVAudioSession.sharedInstance().requestRecordPermission { micGranted in
                DispatchQueue.main.async {
                    let granted = speechStatus == .authorized && micGranted
                    call.resolve(["granted": granted])
                }
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        if audioEngine.isRunning {
            stopEngine()
        }

        let authStatus = SFSpeechRecognizer.authorizationStatus()
        guard authStatus == .authorized else {
            call.reject("Speech recognition not authorized")
            return
        }

        recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        guard let recognizer = recognizer, recognizer.isAvailable else {
            call.reject("Speech recognizer unavailable")
            return
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("Audio session error: \(error.localizedDescription)")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        self.request = request

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            call.reject("Could not start audio engine: \(error.localizedDescription)")
            return
        }

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                self.notifyListeners("transcript", data: [
                    "text": result.bestTranscription.formattedString,
                    "isFinal": result.isFinal,
                ])
                if result.isFinal {
                    self.stopEngine()
                }
            }
            if error != nil {
                self.stopEngine()
            }
        }

        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        stopEngine()
        call.resolve()
    }

    private func stopEngine() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
