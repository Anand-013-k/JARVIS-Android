import React, { useState } from 'react';
import { Database, Plus, Trash2, Tag, Check, BrainCircuit } from 'lucide-react';
import { MemoryItem } from '../types/jarvis';

interface MemoryBankCardProps {
  memories: MemoryItem[];
  setMemories: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
}

export const MemoryBankCard: React.FC<MemoryBankCardProps> = ({ memories, setMemories }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryItem['category']>('preference');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;

    const item: MemoryItem = {
      id: `mem_${Date.now()}`,
      key: newKey.trim(),
      value: newValue.trim(),
      category: newCategory,
      timestamp: Date.now(),
    };

    setMemories(prev => [item, ...prev]);
    setNewKey('');
    setNewValue('');
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="bg-[#091120]/80 border border-cyan-900/40 rounded-xl p-4 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-cyan-900/30">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-cyan-400" />
          <h3 className="font-display font-semibold text-sm tracking-wider uppercase text-cyan-200">
            JARVIS Long-Term Memory Bank
          </h3>
        </div>
        <button
          id="add-memory-button"
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1 text-[11px] font-mono text-cyan-300 bg-cyan-950/70 border border-cyan-800/60 px-2 py-1 rounded hover:bg-cyan-900/40 transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>{isAdding ? 'Cancel' : 'New Memory'}</span>
        </button>
      </div>

      {/* Add Memory Form */}
      {isAdding && (
        <form onSubmit={handleAdd} className="my-3 p-3 bg-cyan-950/30 border border-cyan-800/50 rounded-lg space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-mono text-cyan-400/80 mb-1">Key / Topic</label>
              <input
                type="text"
                placeholder="e.g. coffee_order, user_name"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                className="w-full bg-[#060c16] border border-cyan-900 rounded px-2.5 py-1 text-xs text-cyan-100 placeholder:text-cyan-800 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-cyan-400/80 mb-1">Category</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as any)}
                className="w-full bg-[#060c16] border border-cyan-900 rounded px-2.5 py-1 text-xs text-cyan-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="preference">Preference</option>
                <option value="personal">Personal</option>
                <option value="routine">Routine</option>
                <option value="contact">Contact</option>
                <option value="work">Work</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-cyan-400/80 mb-1">Fact / Detail to Remember</label>
            <input
              type="text"
              placeholder="e.g. Prefers espresso with a dash of oat milk"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              className="w-full bg-[#060c16] border border-cyan-900 rounded px-2.5 py-1 text-xs text-cyan-100 placeholder:text-cyan-800 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="flex items-center gap-1 text-xs font-tech bg-cyan-600 hover:bg-cyan-500 text-cyan-950 font-bold px-3 py-1 rounded transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Commit to Neural Bank</span>
            </button>
          </div>
        </form>
      )}

      {/* Memory Items List */}
      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
        {memories.length === 0 ? (
          <div className="text-center py-6 text-xs font-mono text-cyan-600/70 border border-dashed border-cyan-900/40 rounded-lg">
            No memories stored yet. Speak: &quot;Jarvis, remember that my favorite drink is iced matcha.&quot;
          </div>
        ) : (
          memories.map(mem => (
            <div
              key={mem.id}
              className="flex items-start justify-between p-2.5 bg-cyan-950/20 border border-cyan-900/40 rounded-lg hover:border-cyan-800/60 transition-colors group"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-cyan-300">
                    {mem.key}
                  </span>
                  <span className="text-[9px] font-mono uppercase bg-cyan-900/40 text-cyan-400 px-1.5 py-0.2 rounded border border-cyan-800/50">
                    {mem.category}
                  </span>
                </div>
                <p className="text-xs text-cyan-100/90 font-sans">{mem.value}</p>
              </div>
              <button
                onClick={() => handleDelete(mem.id)}
                title="Erase memory item"
                className="opacity-40 group-hover:opacity-100 p-1 text-rose-400 hover:bg-rose-950/40 rounded transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
