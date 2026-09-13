import React, { useState, useRef, useEffect } from 'react';
import { Send, Volume2, Bot, User, Zap, Sparkles, Trash2, HelpCircle } from 'lucide-react';
import { Message, AssistantState } from '../types/jarvis';

interface ConversationHUDProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onReplayVoice: (text: string) => void;
  onClearMessages: () => void;
  state: AssistantState;
  interimTranscript: string;
}

export const ConversationHUD: React.FC<ConversationHUDProps> = ({
  messages,
  onSendMessage,
  onReplayVoice,
  onClearMessages,
  state,
  interimTranscript,
}) => {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, interimTranscript]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || state === 'processing') return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const samplePrompts = [
    'Turn on the flashlight and boost volume to 80%',
    'Remember that my favorite drink is black coffee',
    'Set a reminder to check thermal telemetry in 15 minutes',
    'Run full Android diagnostics and check battery',
  ];

  return (
    <div className="bg-[#091120]/80 border border-cyan-900/40 rounded-xl flex flex-col h-[460px] backdrop-blur-md overflow-hidden">
      {/* HUD Header */}
      <div className="px-4 py-2.5 border-b border-cyan-900/30 flex items-center justify-between bg-cyan-950/20">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-400" />
          <h3 className="font-display font-semibold text-sm tracking-wider uppercase text-cyan-200">
            Directive Stream & Logs
          </h3>
          <span className="text-[10px] font-mono text-cyan-500/70 border border-cyan-800/40 px-1.5 py-0.2 rounded">
            {messages.length} ENTRIES
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={onClearMessages}
            title="Clear Stream History"
            className="text-cyan-500/60 hover:text-rose-400 p-1 rounded transition-colors text-xs flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span className="text-[10px] font-mono">Clear</span>
          </button>
        )}
      </div>

      {/* Message Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.length === 0 && !interimTranscript && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <div className="w-12 h-12 rounded-full bg-cyan-950/50 border border-cyan-800/50 flex items-center justify-center mb-3 text-cyan-400">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <h4 className="font-display font-bold text-sm text-cyan-200 tracking-wider uppercase">
              JARVIS Core Operational
            </h4>
            <p className="text-xs text-cyan-400/70 max-w-sm mt-1 mb-4 font-sans">
              Tap the central Arc Reactor or speak openly. You can ask general questions, trigger device hardware actions, store memories, or set reminders.
            </p>
            {/* Quick Suggestions */}
            <div className="flex flex-wrap justify-center gap-1.5 max-w-md">
              {samplePrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => onSendMessage(prompt)}
                  className="text-[11px] font-mono bg-cyan-950/40 border border-cyan-900/60 hover:border-cyan-500 text-cyan-300 hover:text-cyan-100 px-2.5 py-1 rounded transition-colors cursor-pointer text-left"
                >
                  &quot;{prompt}&quot;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-cyan-600/20 border border-cyan-500/40 text-cyan-50 rounded-tr-none'
                  : 'bg-[#060c16]/90 border border-cyan-900/60 text-cyan-100 rounded-tl-none arc-glow'
              }`}
            >
              {/* Header inside bubble */}
              <div className="flex items-center justify-between gap-3 mb-1 text-[10px] font-mono">
                <span className={msg.role === 'user' ? 'text-cyan-300 font-semibold' : 'text-cyan-400 font-bold font-tech tracking-wider'}>
                  {msg.role === 'user' ? 'USER DIRECTIVE' : 'J.A.R.V.I.S.'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-500/60">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => onReplayVoice(msg.content)}
                      title="Replay Voice Synthesis"
                      className="text-cyan-400 hover:text-cyan-200 p-0.5 rounded cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Message Content */}
              <p className="font-sans whitespace-pre-wrap">{msg.content}</p>

              {/* Tool Execution Chips if any */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mt-2 pt-2 border-t border-cyan-900/40 space-y-1">
                  {msg.toolCalls.map((tc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 text-[10px] font-mono bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 px-2 py-0.5 rounded"
                    >
                      <Zap className="w-2.5 h-2.5 text-amber-400" />
                      <span className="font-semibold text-cyan-200">{tc.name}</span>
                      <span className="text-cyan-500">({JSON.stringify(tc.args)})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Live Interim Transcript Bubble */}
        {interimTranscript && (
          <div className="flex flex-col items-end">
            <div className="max-w-[85%] rounded-xl rounded-tr-none p-3 text-xs leading-relaxed bg-cyan-900/30 border border-cyan-400/50 text-cyan-200 animate-pulse">
              <span className="block text-[10px] font-mono text-cyan-400 font-semibold mb-1">
                TRANSCRIBING AUDIO...
              </span>
              <p className="font-sans italic">&quot;{interimTranscript}&quot;</p>
            </div>
          </div>
        )}

        {/* Processing Indicator */}
        {state === 'processing' && (
          <div className="flex items-center gap-2 p-2 text-xs font-mono text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg animate-pulse w-fit">
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
            <span>JARVIS Neural Matrix Computing...</span>
          </div>
        )}
      </div>

      {/* Futuristic Input Dock */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-cyan-900/40 bg-[#060c16]/90 flex items-center gap-2">
        <input
          id="jarvis-text-directive-input"
          type="text"
          placeholder="Speak or type an open-ended directive..."
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          disabled={state === 'processing'}
          className="flex-1 bg-[#091222] border border-cyan-900/80 rounded-lg px-3.5 py-2 text-xs text-cyan-100 placeholder:text-cyan-700 focus:outline-none focus:border-cyan-400 transition-colors"
        />
        <button
          id="jarvis-send-directive-button"
          type="submit"
          disabled={!inputText.trim() || state === 'processing'}
          className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-cyan-950 font-bold px-3.5 py-2 rounded-lg text-xs font-tech flex items-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed shadow-md shadow-cyan-500/20"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Transmit</span>
        </button>
      </form>
    </div>
  );
};
