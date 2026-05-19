import speech_recognition as sr
import json
import sys
import threading

class VoiceController:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.microphone = sr.Microphone()
        self.stop_listening = None
        self.is_active = False

    def _callback(self, recognizer, audio):
        # This is called in a background thread when audio is captured
        try:
            # Use Google Speech Recognition by default
            # Note: This requires internet access. For offline, something like pocket-sphinx or whisper-local could be used.
            text = recognizer.recognize_google(audio)
            print(json.dumps({"action": "voice_search", "query": text}), flush=True)
        except sr.UnknownValueError:
            print(json.dumps({"log": "Voice Recognition: Could not understand audio"}), flush=True)
        except sr.RequestError as e:
            print(json.dumps({"log": f"Voice Recognition: Could not request results; {e}"}), flush=True)
        except Exception as e:
            print(json.dumps({"log": f"Voice Recognition: Error in callback: {e}"}), flush=True)

    def start_listening(self):
        if self.is_active:
            return
        
        try:
            with self.microphone as source:
                self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
            
            # listen_in_background returns a function that stops listening
            self.stop_listening = self.recognizer.listen_in_background(self.microphone, self._callback)
            self.is_active = True
            print(json.dumps({"log": "Voice Recognition: Started listening"}), flush=True)
        except Exception as e:
            print(json.dumps({"log": f"Voice Recognition: Failed to start: {e}"}), flush=True)

    def stop_listening_now(self):
        if not self.is_active:
            return
        
        if self.stop_listening:
            self.stop_listening(wait_for_stop=False)
            self.stop_listening = None
        
        self.is_active = False
        print(json.dumps({"log": "Voice Recognition: Stopped listening"}), flush=True)

if __name__ == "__main__":
    # Test block
    vc = VoiceController()
    vc.start_listening()
    import time
    time.sleep(10)
    vc.stop_listening_now()
