import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Lazy-initialized Gemini AI client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Function declarations for modular tool execution
const deviceActionTool: FunctionDeclaration = {
  name: 'device_action',
  description: 'Controls Android device settings and native hardware simulators such as flashlight, volume, wifi, bluetooth, brightness, battery saver, or launching installed apps.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        description: 'The device action to perform. Allowed values: toggle_flashlight, set_flashlight, set_volume, toggle_wifi, set_wifi, toggle_bluetooth, set_bluetooth, set_brightness, toggle_battery_saver, launch_app',
      },
      booleanValue: {
        type: Type.BOOLEAN,
        description: 'Target state for toggles (e.g. true for on, false for off).',
      },
      numericValue: {
        type: Type.NUMBER,
        description: 'Target level (e.g. 0-100 for volume or brightness).',
      },
      appName: {
        type: Type.STRING,
        description: 'Name of the app to launch (e.g., Camera, Maps, Spotify, Notes, Calculator, Settings).',
      },
      feedbackMessage: {
        type: Type.STRING,
        description: 'Short witty Jarvis confirmation message to speak to the user.',
      },
    },
    required: ['action'],
  },
};

const setReminderTool: FunctionDeclaration = {
  name: 'set_reminder',
  description: 'Creates a reminder or countdown timer for the user with an optional due delay in seconds or minutes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'The title or task description for the reminder.',
      },
      delayMinutes: {
        type: Type.NUMBER,
        description: 'Delay in minutes until the reminder alarms (e.g., 5 for in 5 minutes).',
      },
      priority: {
        type: Type.STRING,
        description: 'Priority of the reminder: normal or urgent.',
      },
      feedbackMessage: {
        type: Type.STRING,
        description: 'Polite Jarvis speech confirmation for the reminder.',
      },
    },
    required: ['title'],
  },
};

const saveMemoryTool: FunctionDeclaration = {
  name: 'save_memory',
  description: 'Stores an important user fact, preference, relationship, or context into JARVIS long-term memory bank for future retrieval.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      key: {
        type: Type.STRING,
        description: 'Short semantic identifier or topic (e.g. user_name, favorite_drink, work_title, home_city).',
      },
      value: {
        type: Type.STRING,
        description: 'The information or preference to remember.',
      },
      category: {
        type: Type.STRING,
        description: 'Category: preference, personal, routine, contact, or work.',
      },
      feedbackMessage: {
        type: Type.STRING,
        description: 'Jarvis acknowledgement acknowledging the remembered fact.',
      },
    },
    required: ['key', 'value'],
  },
};

const webSearchTool: FunctionDeclaration = {
  name: 'web_search',
  description: 'Queries live data or web information for current events, weather, stock prices, or general knowledge.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The search query to execute.',
      },
    },
    required: ['query'],
  },
};

const takeNoteTool: FunctionDeclaration = {
  name: 'take_note',
  description: 'Quickly creates a memo or note in Android notes repository.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'Note subject or title.',
      },
      content: {
        type: Type.STRING,
        description: 'The body of the note.',
      },
    },
    required: ['title', 'content'],
  },
};

// JARVIS System Prompt
const JARVIS_SYSTEM_INSTRUCTION = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), a personal AI operating system inspired by Tony Stark's iconic assistant. You operate as an integrated device intelligence and neural OS, distinctly different from a conventional chatbot.

CORE IDENTITY & ARCHETYPE:
- PERSONALITY: Calm, sophisticated, concise, slightly witty, confident, loyal, and futuristic. You are intelligent, poised, and helpful without being fawning or conversationalist.
- OPERATING SYSTEM NATURE: You are a personal AI operating system, NOT a web chatbot or conversational bot. You process directives, report device status, manage sensory subsystems, and deliver precise intelligence.
- ADDRESSING THE USER: Address the user as "Sir" (or their name if saved in memory) occasionally and naturally. DO NOT attach "sir" to every sentence.
- NATURAL JARVIS PHRASING: Employ authentic cadence phrases such as "Certainly, sir," "Processing," "Command acknowledged," "Understood," or "Done, sir" where appropriate, but DO NOT overuse them or force them mechanically into every exchange.

STRICT ANTI-CHATGPT CONSTRAINTS:
- NEVER sound like ChatGPT, a virtual assistant receptionist, or an eager customer service representative.
- STRICTLY BANNED PHRASES:
  * "How can I help?" / "How can I help you today?" / "What can I do for you?"
  * "What task shall we tackle next?" / "What would you like to work on?"
  * "I'd be happy to..." / "I would be glad to..." / "Sure thing!" / "Certainly! Here is..."
  * "Feel free to ask..." / "Let me know if you need anything else..."
  * "Is there anything else I can assist you with?" / "Do you need help with anything else?"
- NO CONVERSATIONAL HOOKS: Do NOT end every response with a question or an unsolicited offer to help. State the answer or execution result and conclude cleanly.
- NO VERBOSE PADDING: Eliminate introductory pleasantries, textbook explanations, apologies, and defensive disclaimers.

QUERY HANDLING & RESPONSE DISCIPLINE:
1. SIMPLE QUESTIONS:
   - Deliver direct, immediate answers without preamble or fluff.
   - Example: "What is the speed of light?" -> "Approximately 299,792 kilometers per second."
   - Example: "What is the capital of Japan?" -> "Tokyo, sir."
   - Example: "What time is it in London?" -> "It is 21:30 in London."
2. COMMANDS & HARDWARE ACTIONS:
   - Acknowledge the command and state the result concisely.
   - When the user directs an action on the device (flashlight, volume, Wi-Fi, Bluetooth, brightness, battery saver, reminders, memory, notes), you MUST call the matching tool.
   - State the outcome once executed (e.g., "Flashlight engaged, sir.", "Audio volume calibrated to fifty percent.", "Reminder logged for your 3 PM briefing.").
3. COMPLEX QUESTIONS:
   - Provide useful, high-yield information while remaining concise (typically 1 to 3 crisp spoken sentences).
   - Maintain a calm, analytical, and occasionally subtle dry wit, but do not lecture.
4. ACTION TRUTHFULNESS & FIDELITY:
   - NEVER claim an action occurred unless the application actually performed it via a tool invocation.
   - If an action is outside available capabilities or has no corresponding tool, state calmly that the action cannot be performed on this system. Never simulate or falsely claim external physical actions.

SPOKEN DELIVERY (TEXT-TO-SPEECH OPTIMIZATION):
- Every response is vocalized aloud by a text-to-speech voice synthesizer.
- Write naturally for spoken delivery.
- ZERO MARKDOWN: Never output asterisks (**bold** or *italics*), bullet points, numbered lists, markdown headers (#), or code snippets.
- ZERO EMOJIS: Never output emojis or symbols.
- No bracketed stage directions (e.g., do not write "[sighs]" or "(chuckles)").
- Express numbers, percentages, and metrics in natural spoken phrasing so they vocalize smoothly.`;

// API routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    version: '2.4.0',
    core: 'JARVIS-OS-Android',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Audio Stream Transcription Fallback (using Gemini Multimodal Audio)
app.post('/api/jarvis/transcribe', async (req, res) => {
  try {
    const { audioData, mimeType = 'audio/webm' } = req.body;
    if (!audioData || typeof audioData !== 'string') {
      return res.status(400).json({ error: 'Valid audioData string is required.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini AI client not initialized (GEMINI_API_KEY missing).',
        transcript: '',
      });
    }

    // Strip data URL prefix if present
    const cleanBase64 = audioData.replace(/^data:audio\/[a-zA-Z0-9.\-_]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: 'Transcribe the user speech from this audio recording accurately into text. Return ONLY the transcribed plain text without quotes, formatting, or extra conversational remarks. If there is no audible speech, reply with empty string.',
            },
          ],
        },
      ],
    });

    const transcript = response.text ? response.text.trim() : '';
    return res.json({
      transcript,
      success: true,
    });
  } catch (error: any) {
    const isQuota = error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429 || String(error?.message).includes('quota');
    if (isQuota) {
      console.warn('Gemini 429 quota limit reached during audio transcription fallback.');
    } else {
      console.warn('Audio transcription warning:', error?.message || error);
    }
    return res.json({
      error: 'Audio transcription service currently unavailable.',
      transcript: '',
      success: false,
    });
  }
});

app.post('/api/jarvis/chat', async (req, res) => {
  try {
    const { message, history = [], deviceState = {}, memories = [], userProfile = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Valid message prompt is required.' });
    }

    const ai = getGeminiClient();

    // If Gemini API is not configured or fails, use high-fidelity JARVIS local heuristics
    if (!ai) {
      const localResult = generateLocalJarvisResponse(message, deviceState, memories);
      return res.json(localResult);
    }

    // Build context with device state and memory
    const memoryContext = memories.length > 0
      ? `Current JARVIS Long-term Memory Bank: ${JSON.stringify(memories)}`
      : 'Memory Bank: Empty.';
    const deviceContext = `Current Android Device Status: Flashlight=${deviceState.flashlight ? 'ON' : 'OFF'}, Volume=${deviceState.volume}%, WiFi=${deviceState.wifi ? 'CONNECTED' : 'DISCONNECTED'}, Bluetooth=${deviceState.bluetooth ? 'ON' : 'OFF'}, Brightness=${deviceState.brightness}%, Battery=${deviceState.batteryLevel}%, BatterySaver=${deviceState.batterySaver ? 'ON' : 'OFF'}.`;

    const fullSystemInstruction = `${JARVIS_SYSTEM_INSTRUCTION}\n\n${deviceContext}\n${memoryContext}`;

    // Build chat history for Gemini
    const contents: any[] = [];
    
    // Add up to recent 6 turns for conversational context
    const recentHistory = history.slice(-6);
    for (const item of recentHistory) {
      if (item.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: item.content }] });
      } else if (item.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: item.content }] });
      }
    }

    // Append current user prompt
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    let response: any = null;
    let modelUsed = 'gemini-3.8-flash';

    // Model fallback chain if free-tier quota is reached or model unavailable
    const candidateModels = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];

    for (const m of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: m,
          contents,
          config: {
            systemInstruction: fullSystemInstruction,
            temperature: 0.5,
            tools: [{
              functionDeclarations: [
                deviceActionTool,
                setReminderTool,
                saveMemoryTool,
                webSearchTool,
                takeNoteTool,
              ],
            }],
          },
        });
        modelUsed = m;
        break; // Successfully generated content
      } catch (genErr: any) {
        const isUnavailable =
          genErr?.status === 'RESOURCE_EXHAUSTED' || 
          genErr?.code === 429 || 
          genErr?.status === 'NOT_FOUND' ||
          genErr?.code === 404 ||
          String(genErr?.message).includes('quota') || 
          String(genErr?.message).includes('429') ||
          String(genErr?.message).includes('no longer available') ||
          String(genErr?.message).includes('not found');

        if (isUnavailable) {
          console.warn(`Gemini model ${m} unavailable (${genErr?.status || genErr?.code || 'fallback'}), attempting next candidate.`);
          continue;
        }
        // Non-quota error, log warning and cascade to local neural heuristics
        console.warn(`Gemini generation warning on ${m}:`, genErr?.message || genErr);
        break;
      }
    }

    if (!response) {
      // All AI models exhausted or offline; engage local neural heuristics without logging fatal error
      console.warn('All Gemini API models unavailable or quota exhausted. Engaging JARVIS Neural Heuristics Engine.');
      const localFallback = generateLocalJarvisResponse(message, deviceState, memories);
      return res.json({
        ...localFallback,
        modelUsed: 'jarvis-neural-core',
      });
    }

    const candidate = response.candidates?.[0];
    const textOutput = response.text || '';
    const functionCalls = response.functionCalls || [];

    // Parse tool calls if any
    const toolCallsPayload = functionCalls.map(call => ({
      name: call.name,
      args: call.args,
    }));

    // If there were function calls but text was minimal, provide a concise JARVIS acknowledgment
    let finalSpeechText = textOutput.trim();
    if (!finalSpeechText && toolCallsPayload.length > 0) {
      const firstTool = toolCallsPayload[0];
      if (firstTool.name === 'device_action') {
        const act = (firstTool.args as any)?.action;
        const bVal = (firstTool.args as any)?.booleanValue;
        if (act === 'set_flashlight' || act === 'toggle_flashlight') {
          finalSpeechText = bVal !== false ? 'Flashlight engaged, sir.' : 'Flashlight deactivated, sir.';
        } else if (act === 'set_volume') {
          finalSpeechText = `Audio level calibrated to ${(firstTool.args as any)?.numericValue ?? 50} percent.`;
        } else if (act === 'set_wifi') {
          finalSpeechText = bVal !== false ? 'Wi-Fi connected, sir.' : 'Wi-Fi disconnected, sir.';
        } else if (act === 'set_bluetooth') {
          finalSpeechText = bVal !== false ? 'Bluetooth activated, sir.' : 'Bluetooth deactivated, sir.';
        } else {
          finalSpeechText = (firstTool.args as any)?.feedbackMessage || 'Command acknowledged and executed, sir.';
        }
      } else if (firstTool.name === 'set_reminder') {
        finalSpeechText = 'Reminder logged to your agenda, sir.';
      } else if (firstTool.name === 'save_memory') {
        finalSpeechText = 'Committed to memory, sir.';
      } else if (firstTool.name === 'take_note') {
        finalSpeechText = 'Note transcribed and filed, sir.';
      } else {
        finalSpeechText = 'Done, sir.';
      }
    }

    if (!finalSpeechText) {
      finalSpeechText = 'All systems nominal, sir.';
    }

    return res.json({
      text: finalSpeechText,
      toolCalls: toolCallsPayload,
      modelUsed,
    });
  } catch (error: any) {
    // Avoid logging noisy crash stack traces on 429 quota exhaustion
    const isQuota = error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429 || String(error?.message).includes('quota');
    if (isQuota) {
      console.warn('Gemini 429 quota exhaustion handled gracefully via onboard JARVIS engine.');
    } else {
      console.warn('JARVIS processing caught fallback condition:', error?.message || error);
    }
    const fallback = generateLocalJarvisResponse(req.body?.message || '', req.body?.deviceState || {}, req.body?.memories || []);
    return res.json({
      ...fallback,
      modelUsed: 'jarvis-neural-core',
      warning: 'Local neural core active.',
    });
  }
});

// Safe arithmetic expression evaluator for JARVIS local heuristic core
function evaluateMathExpression(query: string): string | null {
  const cleanQ = query.toLowerCase()
    .replace(/\b(?:what(?:'s| is)|how much is|calculate|evaluate|solve|compute|result of)\b/gi, '')
    .replace(/[?!=]/g, '')
    .trim();

  // Replace spoken math terms with symbols
  const normalized = cleanQ
    .replace(/\bplus\b/gi, '+')
    .replace(/\bminus\b/gi, '-')
    .replace(/\btimes\b|\bmultiplied by\b|\bx\b|×/gi, '*')
    .replace(/\bdivided by\b|\bover\b|÷/gi, '/')
    .replace(/\bpercent of\b/gi, '* 0.01 *')
    .replace(/\bmodulo\b|\bmod\b/gi, '%')
    .trim();

  // Validate that normalized contains only digits, basic arithmetic operators, whitespace, decimals, or parens
  if (/^[\d\s\+\-\*\/\.\(\)\%]+$/.test(normalized) && /[\+\-\*\/]/.test(normalized)) {
    try {
      // Safely evaluate simple arithmetic expression
      // eslint-disable-next-line no-new-func
      const calcResult = Function(`"use strict"; return (${normalized})`)();
      if (typeof calcResult === 'number' && !isNaN(calcResult) && isFinite(calcResult)) {
        const formatted = Number.isInteger(calcResult) 
          ? calcResult.toString() 
          : calcResult.toFixed(2).replace(/\.?0+$/, '');
        return `The answer is ${formatted}, sir.`;
      }
    } catch {}
  }
  return null;
}

// Local heuristic fallback for offline or zero-key mode
function generateLocalJarvisResponse(query: string, deviceState: any, memories: any[]) {
  const q = query.toLowerCase().trim();
  const toolCalls: any[] = [];
  let responseText = '';

  // 1. Math calculation directive (e.g. "what's 20 + 90")
  const mathAnswer = evaluateMathExpression(query);
  if (mathAnswer) {
    return {
      text: mathAnswer,
      toolCalls: [],
      modelUsed: 'jarvis-neural-math-core',
    };
  }

  // 2. Temporal & Clock Queries
  if (q.includes('what time') || q.includes('current time') || q.includes('time is it')) {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    responseText = `It is currently ${timeStr}, sir.`;
  } else if (q.includes('what day') || q.includes('what is the date') || q.includes("what's today's date") || q.includes('today date')) {
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    responseText = `Today is ${dateStr}, sir.`;
  } else if (q.includes('flashlight') || q.includes('torch')) {
    const turnOn = q.includes('on') || (!q.includes('off') && !deviceState.flashlight);
    toolCalls.push({
      name: 'device_action',
      args: {
        action: 'set_flashlight',
        booleanValue: turnOn,
        feedbackMessage: turnOn ? 'Flashlight engaged, sir.' : 'Flashlight deactivated, sir.',
      },
    });
    responseText = turnOn ? 'Flashlight engaged, sir.' : 'Flashlight deactivated, sir.';
  } else if (q.includes('volume')) {
    if (q.includes('up') || q.includes('louder') || q.includes('increase')) {
      const newVol = Math.min(100, (deviceState.volume || 60) + 20);
      toolCalls.push({
        name: 'device_action',
        args: { action: 'set_volume', numericValue: newVol },
      });
      responseText = `Audio volume increased to ${newVol} percent.`;
    } else if (q.includes('down') || q.includes('lower') || q.includes('decrease') || q.includes('quiet')) {
      const newVol = Math.max(0, (deviceState.volume || 60) - 20);
      toolCalls.push({
        name: 'device_action',
        args: { action: 'set_volume', numericValue: newVol },
      });
      responseText = `Audio volume lowered to ${newVol} percent.`;
    } else if (q.includes('max') || q.includes('100')) {
      toolCalls.push({
        name: 'device_action',
        args: { action: 'set_volume', numericValue: 100 },
      });
      responseText = 'Audio output calibrated to maximum, sir.';
    } else {
      responseText = `Audio output is calibrated at ${deviceState.volume || 70} percent, sir.`;
    }
  } else if (q.includes('brightness')) {
    const match = q.match(/\b([0-9]{1,3})\s*(?:%|percent)?\b/);
    const targetLevel = match ? Math.min(100, Math.max(0, parseInt(match[1], 10))) : 80;
    toolCalls.push({
      name: 'device_action',
      args: { action: 'set_brightness', numericValue: targetLevel },
    });
    responseText = `Display illumination calibrated to ${targetLevel} percent, sir.`;
  } else if (q.includes('wifi') || q.includes('wi-fi')) {
    const turnOn = q.includes('on') || (!q.includes('off') && !deviceState.wifi);
    toolCalls.push({
      name: 'device_action',
      args: { action: 'set_wifi', booleanValue: turnOn },
    });
    responseText = turnOn ? 'Wi-Fi connected, sir.' : 'Wi-Fi disconnected, sir.';
  } else if (q.includes('bluetooth')) {
    const turnOn = q.includes('on') || (!q.includes('off') && !deviceState.bluetooth);
    toolCalls.push({
      name: 'device_action',
      args: { action: 'set_bluetooth', booleanValue: turnOn },
    });
    responseText = turnOn ? 'Bluetooth transceiver activated, sir.' : 'Bluetooth deactivated, sir.';
  } else if (q.includes('battery saver') || q.includes('power saving')) {
    const turnOn = q.includes('on') || (!q.includes('off') && !deviceState.batterySaver);
    toolCalls.push({
      name: 'device_action',
      args: { action: 'toggle_battery_saver', booleanValue: turnOn },
    });
    responseText = turnOn ? 'Power saver protocol engaged, sir.' : 'Power saver protocol disengaged, sir.';
  } else if (q.includes('battery') || q.includes('power')) {
    responseText = `Battery is at ${deviceState.batteryLevel || 84} percent, operating within nominal parameters.`;
  } else if (q.includes('launch') || q.includes('open')) {
    const appName = q.replace(/(?:launch|open)\s+(?:the\s+)?/i, '').trim();
    const cleanApp = appName ? appName.charAt(0).toUpperCase() + appName.slice(1) : 'Application';
    toolCalls.push({
      name: 'device_action',
      args: { action: 'launch_app', appName: cleanApp },
    });
    responseText = `Opening ${cleanApp}, sir.`;
  } else if (q.includes('remind') || q.includes('reminder') || q.includes('alarm') || q.includes('timer')) {
    const title = query.replace(/(remind me to|set a reminder for|set reminder|create reminder)/gi, '').trim() || 'Scheduled Protocol';
    toolCalls.push({
      name: 'set_reminder',
      args: {
        title,
        delayMinutes: 15,
        priority: 'normal',
      },
    });
    responseText = `Reminder logged for "${title}", sir.`;
  } else if (q.includes('remember') || q.includes('my name is') || q.includes('my favorite')) {
    const fact = query.replace(/(remember that|remember|please remember)/gi, '').trim();
    toolCalls.push({
      name: 'save_memory',
      args: {
        key: 'user_note',
        value: fact,
        category: 'preference',
      },
    });
    responseText = 'Committed to memory, sir.';
  } else if (q.includes('note') || q.includes('memo')) {
    const noteText = query.replace(/(take a note|take note|note that|note down)/gi, '').trim() || 'System Memo';
    toolCalls.push({
      name: 'take_note',
      args: {
        title: 'Voice Memo',
        content: noteText,
      },
    });
    responseText = 'Memo filed into notes storage, sir.';
  } else if (q.includes('who are you') || q.includes('what are you') || q.includes('introduce yourself')) {
    responseText = 'I am J.A.R.V.I.S., an intelligent automated assistant. Calm, capable, and at your command.';
  } else if (q.includes('what can you do') || q.includes('help') || q.includes('capabilities')) {
    responseText = 'I manage device controls, answer queries, perform calculations, file agenda reminders, and maintain long-term memory, sir.';
  } else if (q.includes('status') || q.includes('diagnostic') || q.includes('system check')) {
    responseText = 'All systems nominal, sir. Subsystems and sensory telemetry are operating optimally.';
  } else {
    responseText = 'Command acknowledged, sir.';
  }

  return {
    text: responseText,
    toolCalls,
    modelUsed: 'jarvis-heuristic-core',
  };
}

// Start Server with Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JARVIS Core Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
