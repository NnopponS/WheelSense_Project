'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Loader2, Sparkles,
  CheckCircle, XCircle, Lightbulb, Thermometer, Fan, Tv, Power
} from 'lucide-react';
import { sendChatMessage, ChatResponse } from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: { success: boolean; message: string }[];
  timestamp: Date;
}

export default function UserAIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'สวัสดีครับ! ผมคือ WheelSense AI 🤖\n\nผมช่วยคุณได้:\n• เปิด/ปิดไฟ แอร์ พัดลม\n• ตรวจสอบตำแหน่งปัจจุบัน\n• ดูสถานะอุปกรณ์\n\nพิมพ์คำสั่งได้เลยครับ!',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();

    setMessages(prev => [...prev, {
      id: Date.now().toString(), role: 'user', content: text, timestamp: new Date(),
    }]);
    setInput('');
    setLoading(true);

    try {
      const response = await sendChatMessage(text);
      if (response.data) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: response.data!.response, actions: response.data!.actions,
          timestamp: new Date(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: 'ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', timestamp: new Date(),
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: 'ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่', timestamp: new Date(),
      }]);
    }

    setLoading(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const quickCommands = [
    { label: '💡 เปิดไฟ', command: 'เปิดไฟห้องนอน' },
    { label: '❄️ เปิดแอร์', command: 'เปิดแอร์ห้องนอน' },
    { label: '📍 ตำแหน่ง', command: 'ฉันอยู่ห้องไหน' },
    { label: '🔌 ปิดทุกอย่าง', command: 'ปิดอุปกรณ์ทั้งหมด' },
  ];

  const getActionIcon = (message: string) => {
    const lower = message.toLowerCase();
    if (lower.includes('light') || lower.includes('ไฟ')) return <Lightbulb size={14} />;
    if (lower.includes('ac') || lower.includes('แอร์')) return <Thermometer size={14} />;
    if (lower.includes('fan') || lower.includes('พัดลม')) return <Fan size={14} />;
    if (lower.includes('tv') || lower.includes('ทีวี')) return <Tv size={14} />;
    return <Power size={14} />;
  };

  return (
    <div className="page-content" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 0 }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{
          width: '2.5rem', height: '2.5rem', borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={20} color="white" />
        </div>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>AI Assistant</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>ผู้ช่วยอัจฉริยะ • พร้อมให้บริการ</p>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '1.25rem',
        display: 'flex', flexDirection: 'column', gap: '0.875rem',
      }}>
        {messages.map((message) => (
          <div
            key={message.id}
            className="chat-message-animate"
            style={{
              display: 'flex', gap: '0.625rem',
              flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
            }}
          >
            <div style={{
              width: '2rem', height: '2rem', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, color: 'white',
              background: message.role === 'user'
                ? '#3b82f6'
                : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            }}>
              {message.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div style={{ maxWidth: '80%' }}>
              <div style={{
                borderRadius: '1rem', padding: '0.625rem 0.875rem',
                fontSize: '0.875rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                ...(message.role === 'user' ? {
                  background: '#3b82f6', color: 'white', borderBottomRightRadius: '0.25rem',
                } : {
                  background: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderBottomLeftRadius: '0.25rem',
                }),
              }}>
                {message.content}
              </div>

              {message.actions && message.actions.length > 0 && (
                <div style={{ marginTop: '0.375rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {message.actions.map((action, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      fontSize: '0.75rem', padding: '0.4rem 0.625rem', borderRadius: '0.5rem',
                      background: action.success ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: action.success ? '#34d399' : '#f87171',
                    }}>
                      {action.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {getActionIcon(action.message)}
                      <span>{action.message}</span>
                    </div>
                  ))}
                </div>
              )}

              <p style={{ fontSize: '0.675rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {message.timestamp.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message-animate" style={{ display: 'flex', gap: '0.625rem' }}>
            <div style={{
              width: '2rem', height: '2rem', borderRadius: '50%',
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            }}>
              <Bot size={14} />
            </div>
            <div style={{
              background: 'var(--bg-tertiary)', borderRadius: '1rem',
              borderBottomLeftRadius: '0.25rem', padding: '0.75rem 1.25rem',
              display: 'flex', gap: '0.375rem', alignItems: 'center',
            }}>
              <span className="typing-dot" style={{ animationDelay: '0ms' }} />
              <span className="typing-dot" style={{ animationDelay: '150ms' }} />
              <span className="typing-dot" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Commands */}
      <div style={{ padding: '0 1.25rem 0.5rem', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: '0.25rem' }}>
          {quickCommands.map((cmd, idx) => (
            <button
              key={idx}
              onClick={() => { setInput(cmd.command); inputRef.current?.focus(); }}
              style={{
                flexShrink: 0, fontSize: '0.8rem', padding: '0.375rem 0.75rem',
                borderRadius: '9999px', border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--primary-600)';
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--bg-secondary)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {cmd.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{
        padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="พิมพ์ข้อความ..."
            disabled={loading}
            style={{
              flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border-color)',
              borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.875rem',
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              width: '2.75rem', height: '2.75rem', borderRadius: '0.75rem',
              background: !input.trim() || loading ? 'var(--bg-tertiary)' : 'var(--primary-500)',
              border: 'none', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
