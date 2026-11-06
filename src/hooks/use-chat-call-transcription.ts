import { useEffect, useRef } from "react";
import { postChatCallTranscript } from "@/lib/chat-call-api";

// Minimal Web Speech API surface used here (not in the TS DOM lib).
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { isFinal: boolean; [index: number]: { transcript: string } };
  };
}

interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type UseChatCallTranscriptionArgs = {
  teamId: number | null;
  callId: number | null;
  active: boolean;
  muted: boolean;
  userId: number;
  displayName: string;
  callStartMs: number;
};

export function useChatCallTranscription({
  teamId,
  callId,
  active,
  muted,
  userId,
  displayName,
  callStartMs,
}: UseChatCallTranscriptionArgs): { supported: boolean } {
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (!teamId || !callId || !active || muted) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      return;
    }

    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.isFinal) continue;
        const text = result[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        const spokenAtMs = Math.max(0, Date.now() - callStartMs);
        void postChatCallTranscript(teamId, callId, {
          text,
          displayName,
          spokenAtMs,
        });
      }
    };

    recognition.onend = () => {
      if (active && !muted && recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          /* ignore restart errors */
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      /* ignore */
    }

    return () => {
      recognition.stop();
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };
  }, [teamId, callId, active, muted, displayName, callStartMs, userId]);

  return { supported: getSpeechRecognition() != null };
}
