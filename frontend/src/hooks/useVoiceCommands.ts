import { useRef, useState, useCallback, useEffect } from 'react';
import { speakScoobi } from '../services/ttsService';

// Available voice commands and their intent
interface VoiceCommand {
  patterns: RegExp[];
  intent: string;
}

const COMMANDS: VoiceCommand[] = [
  {
    patterns: [
      /(?:set|upload|open|load)\s*(?:a\s*)?map/i,
      /(?:let'?s?\s*)?(?:set|upload|add)\s*(?:a\s*)?map/i,
      /map\s*(?:upload|set)/i,
    ],
    intent: 'upload_map',
  },
  {
    patterns: [
      /(?:set|switch|change|go)\s*(?:to\s*)?diver\s*mode/i,
      /diver\s*mode\s*(?:on|please)?/i,
    ],
    intent: 'set_diver_mode',
  },
  {
    patterns: [
      /(?:set|switch|change|go)\s*(?:to\s*)?(?:marine|bio|biologist)\s*mode/i,
      /(?:marine|bio|biologist)\s*mode\s*(?:on|please)?/i,
    ],
    intent: 'set_marine_mode',
  },
  {
    patterns: [
      /(?:upload|load|add|set)\s*(?:a\s*)?(?:demo\s*)?video/i,
      /(?:let'?s?\s*)?(?:upload|load)\s*(?:a\s*)?video/i,
      /demo\s*video/i,
    ],
    intent: 'upload_video',
  },
  {
    patterns: [
      /(?:start|begin|launch|go)\s*(?:the\s*)?dive/i,
      /(?:let'?s?\s*)?(?:start|begin|go)\s*div/i,
    ],
    intent: 'start_dive',
  },
  {
    patterns: [
      /(?:what'?s?\s*(?:the\s*)?)?difference\s*(?:between|of)?\s*(?:the\s*)?(?:modes?|diver|marine)/i,
      /(?:explain|tell\s*me\s*about)\s*(?:the\s*)?modes?/i,
      /(?:what|which)\s*(?:are|is)\s*(?:the\s*)?modes?/i,
    ],
    intent: 'explain_modes',
  },
  {
    patterns: [
      /(?:what|who)\s*(?:are|is)\s*(?:you|scoobi|scoob)/i,
      /(?:tell\s*me\s*about)\s*(?:yourself|scoobi)/i,
      /(?:introduce|hey|hi|hello)\s*(?:yourself|scoobi)?/i,
    ],
    intent: 'introduce',
  },
  {
    patterns: [
      /(?:what\s*(?:can|do)\s*(?:you|i)\s*(?:do|set|configure))/i,
      /(?:help|options|commands)/i,
      /what\s*(?:can\s*)?(?:i|we)\s*(?:do|say)/i,
    ],
    intent: 'help',
  },
];

// Scoobi's responses for each intent
const RESPONSES: Record<string, string> = {
  upload_map: "Sure thing! Go ahead and upload your dive site map — you can take a photo or pick a file.",
  set_diver_mode: "Switching to diver mode. You'll get a clean safety HUD with voice alerts only.",
  set_marine_mode: "Switching to marine biologist mode. You'll see species cards and full analysis data alongside the HUD.",
  upload_video: "Let's load a demo video. Pick a POV dive clip and I'll use it as the camera feed.",
  start_dive: "Alright, let's get in the water!",
  explain_modes: "Diver mode gives you a minimal HUD focused on safety — depth, air, temperature, and voice alerts. Marine biologist mode adds species identification cards, agent data, and detailed analysis overlays. Both modes have full voice interaction with me.",
  introduce: "Hey! I'm Scoobi, your AI dive buddy. I watch your camera feed, read your gauges, identify marine life, and keep you on course. Think of me as the dive buddy who never loses focus.",
  help: "You can ask me to set diver or marine mode, upload a map or video, start the dive, or ask me anything about the setup. Just speak naturally!",
  not_understood: "I didn't quite catch that. You can ask me to set a mode, upload a map, or start the dive.",
};

function matchIntent(transcript: string): string | null {
  const cleaned = transcript.toLowerCase().trim();
  // Strip wake word
  const withoutWake = cleaned.replace(/^(?:hey\s*)?scoo?bi[e]?\s*,?\s*/i, '');
  const toMatch = withoutWake || cleaned;

  for (const cmd of COMMANDS) {
    for (const pattern of cmd.patterns) {
      if (pattern.test(toMatch)) {
        return cmd.intent;
      }
    }
  }
  return null;
}

interface UseVoiceCommandsOptions {
  onUploadMap: () => void;
  onSetDiverMode: () => void;
  onSetMarineMode: () => void;
  onUploadVideo: () => void;
  onStartDive: () => void;
}

export function useVoiceCommands(options: UseVoiceCommandsOptions) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Check if Speech Recognition is available
  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setTranscript('');
      setLastIntent(null);
    };

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript;
      setTranscript(text);

      // Only act on final results
      if (result.isFinal) {
        const intent = matchIntent(text);
        setLastIntent(intent);

        if (intent) {
          // Respond with TTS
          speakScoobi(RESPONSES[intent], false);

          // Execute the command
          switch (intent) {
            case 'upload_map': options.onUploadMap(); break;
            case 'set_diver_mode': options.onSetDiverMode(); break;
            case 'set_marine_mode': options.onSetMarineMode(); break;
            case 'upload_video': options.onUploadVideo(); break;
            case 'start_dive': options.onStartDive(); break;
            // explain_modes, introduce, help — TTS only, no action
          }
        } else {
          speakScoobi(RESPONSES.not_understood, false);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('[VoiceCommand] error:', event.error);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, options]);

  const toggleListening = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopListening(); };
  }, [stopListening]);

  return {
    listening,
    transcript,
    lastIntent,
    isSupported,
    toggleListening,
    startListening,
    stopListening,
  };
}
