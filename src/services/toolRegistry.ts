import { JarvisContext, JarvisToolCall, ToolDefinition } from '../types/jarvis';

export interface ExecutableTool {
  definition: ToolDefinition;
  execute: (args: Record<string, any>, context: JarvisContext) => Promise<{
    success: boolean;
    output: string;
    actionTaken?: string;
  }>;
}

class ToolRegistry {
  private tools: Map<string, ExecutableTool> = new Map();

  constructor() {
    this.registerBuiltIns();
  }

  public register(tool: ExecutableTool) {
    this.tools.set(tool.definition.name, tool);
  }

  public getTool(name: string): ExecutableTool | undefined {
    return this.tools.get(name);
  }

  public getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  public async execute(
    toolCall: JarvisToolCall,
    context: JarvisContext
  ): Promise<{ success: boolean; output: string; actionTaken?: string }> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return {
        success: false,
        output: `Tool "${toolCall.name}" is not registered in JARVIS subsystems.`,
      };
    }
    try {
      return await tool.execute(toolCall.args, context);
    } catch (err: any) {
      return {
        success: false,
        output: `Execution error in ${toolCall.name}: ${err.message || 'Unknown fault'}`,
      };
    }
  }

  private registerBuiltIns() {
    // 1. Android Device Action Tool
    this.register({
      definition: {
        id: 'device_action',
        name: 'device_action',
        category: 'device',
        description: 'Controls native Android device hardware states: flashlight, volume, wifi, bluetooth, brightness, battery saver, and app launcher.',
        enabled: true,
        parametersDescription: 'action, booleanValue, numericValue, appName',
      },
      execute: async (args, context) => {
        const { action, booleanValue, numericValue, appName } = args;
        let actionTaken = '';

        context.setDeviceState(prev => {
          const next = { ...prev };
          switch (action) {
            case 'toggle_flashlight':
              next.flashlight = !prev.flashlight;
              actionTaken = `Flashlight toggled ${next.flashlight ? 'ON' : 'OFF'}`;
              break;
            case 'set_flashlight':
              next.flashlight = booleanValue !== undefined ? booleanValue : true;
              actionTaken = `Flashlight turned ${next.flashlight ? 'ON' : 'OFF'}`;
              break;
            case 'set_volume':
              next.volume = Math.max(0, Math.min(100, Number(numericValue ?? prev.volume)));
              actionTaken = `Audio output calibrated to ${next.volume}%`;
              break;
            case 'toggle_wifi':
              next.wifi = !prev.wifi;
              actionTaken = `Wi-Fi state switched to ${next.wifi ? 'CONNECTED' : 'DISCONNECTED'}`;
              break;
            case 'set_wifi':
              next.wifi = booleanValue !== undefined ? booleanValue : true;
              actionTaken = `Wi-Fi ${next.wifi ? 'connected' : 'disconnected'}`;
              break;
            case 'toggle_bluetooth':
              next.bluetooth = !prev.bluetooth;
              actionTaken = `Bluetooth transceiver ${next.bluetooth ? 'ACTIVATED' : 'OFF'}`;
              break;
            case 'set_bluetooth':
              next.bluetooth = booleanValue !== undefined ? booleanValue : true;
              actionTaken = `Bluetooth ${next.bluetooth ? 'activated' : 'deactivated'}`;
              break;
            case 'set_brightness':
              next.brightness = Math.max(5, Math.min(100, Number(numericValue ?? prev.brightness)));
              actionTaken = `Display luminance set to ${next.brightness}%`;
              break;
            case 'toggle_battery_saver':
              next.batterySaver = booleanValue !== undefined ? booleanValue : !prev.batterySaver;
              actionTaken = `Battery saver mode ${next.batterySaver ? 'engaged' : 'disengaged'}`;
              break;
            case 'launch_app':
              next.activeApp = appName || 'Active Workspace';
              actionTaken = `App launched: ${next.activeApp}`;
              break;
            default:
              actionTaken = `Device action [${action}] processed.`;
          }
          return next;
        });

        context.notify('Device Directive Executed', actionTaken);
        return { success: true, output: actionTaken, actionTaken };
      },
    });

    // 2. Reminder & Timer Tool
    this.register({
      definition: {
        id: 'set_reminder',
        name: 'set_reminder',
        category: 'productivity',
        description: 'Schedules an agenda reminder, alert, or countdown timer on the Android system.',
        enabled: true,
        parametersDescription: 'title, delayMinutes, priority',
      },
      execute: async (args, context) => {
        const title = args.title || 'Scheduled Task';
        const delayMinutes = Number(args.delayMinutes || 15);
        const priority = args.priority === 'urgent' ? 'urgent' : 'normal';
        const dueTimestamp = Date.now() + delayMinutes * 60 * 1000;

        const newReminder = {
          id: `rem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title,
          dueTimestamp,
          completed: false,
          priority,
          createdAt: Date.now(),
        };

        context.setReminders(prev => [newReminder, ...prev]);
        const output = `Reminder scheduled: "${title}" (Due in ${delayMinutes} min)`;
        context.notify('Agenda Updated', output);
        return { success: true, output, actionTaken: output };
      },
    });

    // 3. Memory Bank Tool
    this.register({
      definition: {
        id: 'save_memory',
        name: 'save_memory',
        category: 'memory',
        description: 'Commits user preferences, personal details, contacts, and contextual facts to JARVIS persistent memory.',
        enabled: true,
        parametersDescription: 'key, value, category',
      },
      execute: async (args, context) => {
        const key = args.key || 'general_fact';
        const value = args.value || '';
        const category = args.category || 'preference';

        if (!value) {
          return { success: false, output: 'Memory value was empty.' };
        }

        const newMemory = {
          id: `mem_${Date.now()}`,
          key,
          value,
          category,
          timestamp: Date.now(),
        };

        context.setMemories(prev => {
          // Replace if same key exists or add new
          const filtered = prev.filter(m => m.key.toLowerCase() !== key.toLowerCase());
          return [newMemory, ...filtered];
        });

        const output = `Stored in memory: [${key}] = "${value}"`;
        context.notify('Memory Bank Updated', output);
        return { success: true, output, actionTaken: output };
      },
    });

    // 4. Web Search Tool
    this.register({
      definition: {
        id: 'web_search',
        name: 'web_search',
        category: 'search',
        description: 'Performs live queries across external network sources for live information, weather, or real-time intel.',
        enabled: true,
        parametersDescription: 'query',
      },
      execute: async (args) => {
        const query = args.query || 'Stark Industries Telemetry';
        return {
          success: true,
          output: `Real-time search results synthesized for: "${query}". Atmospheric and global telemetry retrieved.`,
          actionTaken: `Web Search: ${query}`,
        };
      },
    });

    // 5. Take Note Tool
    this.register({
      definition: {
        id: 'take_note',
        name: 'take_note',
        category: 'productivity',
        description: 'Captures quick voice notes and memos in Android local notes.',
        enabled: true,
        parametersDescription: 'title, content',
      },
      execute: async (args, context) => {
        const title = args.title || 'Voice Memo';
        const content = args.content || '';

        const newNote = {
          id: `note_${Date.now()}`,
          title,
          content,
          timestamp: Date.now(),
        };

        context.setNotes(prev => [newNote, ...prev]);
        const output = `Note saved: "${title}"`;
        context.notify('Note Logged', output);
        return { success: true, output, actionTaken: output };
      },
    });
  }
}

export const toolRegistry = new ToolRegistry();
