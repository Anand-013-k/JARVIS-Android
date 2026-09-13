import React, { useState } from 'react';
import { Bell, CheckCircle2, Circle, Clock, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { ReminderItem } from '../types/jarvis';

interface RemindersCardProps {
  reminders: ReminderItem[];
  setReminders: React.Dispatch<React.SetStateAction<ReminderItem[]>>;
}

export const RemindersCard: React.FC<RemindersCardProps> = ({ reminders, setReminders }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(15);
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newReminder: ReminderItem = {
      id: `rem_${Date.now()}`,
      title: newTitle.trim(),
      dueTimestamp: Date.now() + delayMinutes * 60 * 1000,
      completed: false,
      priority,
      createdAt: Date.now(),
    };

    setReminders(prev => [newReminder, ...prev]);
    setNewTitle('');
    setIsAdding(false);
  };

  const toggleComplete = (id: string) => {
    setReminders(prev =>
      prev.map(r => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
  };

  const handleDelete = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="bg-[#091120]/80 border border-cyan-900/40 rounded-xl p-4 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-cyan-900/30">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-cyan-400" />
          <h3 className="font-display font-semibold text-sm tracking-wider uppercase text-cyan-200">
            Agenda & Reminders
          </h3>
        </div>
        <button
          id="add-reminder-toggle-button"
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1 text-[11px] font-mono text-cyan-300 bg-cyan-950/70 border border-cyan-800/60 px-2 py-1 rounded hover:bg-cyan-900/40 transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>{isAdding ? 'Cancel' : 'New Reminder'}</span>
        </button>
      </div>

      {/* Add Form */}
      {isAdding && (
        <form onSubmit={handleAdd} className="my-3 p-3 bg-cyan-950/30 border border-cyan-800/50 rounded-lg space-y-2">
          <div>
            <label className="block text-[10px] font-mono text-cyan-400/80 mb-1">Reminder Directive</label>
            <input
              type="text"
              placeholder="e.g. Calibrate suit thrusters, Call Pepper"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full bg-[#060c16] border border-cyan-900 rounded px-2.5 py-1 text-xs text-cyan-100 placeholder:text-cyan-800 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-mono text-cyan-400/80 mb-1">Due In (Minutes)</label>
              <input
                type="number"
                min="1"
                max="1440"
                value={delayMinutes}
                onChange={e => setDelayMinutes(Number(e.target.value))}
                className="w-full bg-[#060c16] border border-cyan-900 rounded px-2.5 py-1 text-xs text-cyan-100 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-cyan-400/80 mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
                className="w-full bg-[#060c16] border border-cyan-900 rounded px-2.5 py-1 text-xs text-cyan-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent Priority</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="text-xs font-tech bg-cyan-600 hover:bg-cyan-500 text-cyan-950 font-bold px-3 py-1 rounded transition-colors"
            >
              Commit Reminder
            </button>
          </div>
        </form>
      )}

      {/* Reminders List */}
      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
        {reminders.length === 0 ? (
          <div className="text-center py-6 text-xs font-mono text-cyan-600/70 border border-dashed border-cyan-900/40 rounded-lg">
            No active agenda items. Speak: &quot;Jarvis, remind me to check the server in 20 minutes.&quot;
          </div>
        ) : (
          reminders.map(rem => {
            const isOverdue = Date.now() > rem.dueTimestamp;
            const dueTimeStr = new Date(rem.dueTimestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={rem.id}
                className={`flex items-center justify-between p-2.5 border rounded-lg transition-colors group ${
                  rem.completed
                    ? 'bg-cyan-950/10 border-cyan-900/20 opacity-60'
                    : rem.priority === 'urgent'
                    ? 'bg-rose-950/20 border-rose-900/40 hover:border-rose-700/50'
                    : 'bg-cyan-950/20 border-cyan-900/40 hover:border-cyan-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => toggleComplete(rem.id)}
                    className="text-cyan-400 hover:text-cyan-200 transition-colors cursor-pointer"
                  >
                    {rem.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Circle className="w-4 h-4 text-cyan-600" />
                    )}
                  </button>
                  <div>
                    <p
                      className={`text-xs font-sans ${
                        rem.completed ? 'line-through text-cyan-600' : 'text-cyan-100 font-medium'
                      }`}
                    >
                      {rem.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-400/70">
                        <Clock className="w-2.5 h-2.5" />
                        <span>Due: {dueTimeStr}</span>
                      </span>
                      {rem.priority === 'urgent' && (
                        <span className="flex items-center gap-0.5 text-[9px] font-mono text-rose-400 uppercase bg-rose-950/60 px-1 py-0.2 rounded border border-rose-800/40">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          <span>Urgent</span>
                        </span>
                      )}
                      {isOverdue && !rem.completed && (
                        <span className="text-[9px] font-mono text-amber-400 uppercase bg-amber-950/60 px-1 py-0.2 rounded border border-amber-800/40">
                          Alarm Alert
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(rem.id)}
                  title="Remove reminder"
                  className="opacity-40 group-hover:opacity-100 p-1 text-rose-400 hover:bg-rose-950/40 rounded transition-opacity cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
