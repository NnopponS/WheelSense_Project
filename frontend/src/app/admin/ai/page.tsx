'use client';

import { useEffect, useState, useRef } from 'react';
import {
    MessageCircle, Send, Plus, Trash2, Clock, Bot, User
} from 'lucide-react';
import {
    createChatSession, listChatSessions, getSessionMessages,
    deleteChatSession, sendChatMessage
} from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function AdminAIPage() {
    const { t, language } = useTranslation();
    const [sessions, setSessions] = useState<any[]>([]);
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const messagesEnd = useRef<HTMLDivElement>(null);

    const fetchSessions = async () => {
        const res = await listChatSessions();
        if (res.data) setSessions(res.data.sessions || []);
        setLoading(false);
    };

    useEffect(() => { fetchSessions(); }, []);

    const loadMessages = async (sessionId: string) => {
        setActiveSession(sessionId);
        const res = await getSessionMessages(sessionId);
        if (res.data) setMessages(res.data.messages || []);
    };

    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleNewSession = async () => {
        const res = await createChatSession({ role: 'admin', title: `Admin Chat ${new Date().toLocaleDateString()}` });
        if (res.data) {
            await fetchSessions();
            loadMessages(res.data.session_id);
        }
    };

    const handleDeleteSession = async (id: string) => {
        await deleteChatSession(id);
        if (activeSession === id) { setActiveSession(null); setMessages([]); }
        fetchSessions();
    };

    const handleSend = async () => {
        if (!input.trim() || !activeSession || sending) return;
        const msg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: msg, created_at: new Date().toISOString() }]);
        setSending(true);

        try {
            const response = await sendChatMessage(msg, { role: 'admin', sessionId: activeSession });
            const reply = response.data?.response || response.error || 'No response';
            setMessages(prev => [...prev, { role: 'assistant', content: reply, created_at: new Date().toISOString(), actions: response.data?.actions }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to get response', created_at: new Date().toISOString() }]);
        }
        setSending(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1rem', height: 'calc(100vh - 120px)' }}>
            {/* Sessions Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <button onClick={handleNewSession}
                        style={{ width: '100%', background: 'var(--primary-500)', border: 'none', borderRadius: '8px', padding: '0.5rem', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <Plus size={16} /> {t('ai.newChat')}
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                    {sessions.map(s => (
                        <div key={s.id}
                            onClick={() => loadMessages(s.id)}
                            style={{
                                padding: '0.5rem 0.75rem', borderRadius: '8px', cursor: 'pointer', marginBottom: '0.25rem',
                                background: activeSession === s.id ? 'var(--primary-500-10)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                            <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || t('ai.untitled')}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{new Date(s.created_at).toLocaleDateString()}</div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                                style={{ background: 'none', border: 'none', color: 'var(--danger-400)', cursor: 'pointer', flexShrink: 0 }}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--bg-tertiary)', overflow: 'hidden' }}>
                {activeSession ? (
                    <>
                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {messages.map((m, i) => (
                                <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                                        background: m.role === 'user' ? 'var(--primary-500)' : 'linear-gradient(135deg, var(--info-500), var(--info-600))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                    </div>
                                    <div style={{
                                        maxWidth: '70%', padding: '0.75rem 1rem', borderRadius: '12px',
                                        background: m.role === 'user' ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                                        color: 'white',
                                    }}>
                                        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', lineHeight: 1.5 }}>{m.content}</div>
                                        {m.actions && m.actions.length > 0 && (
                                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem' }}>{t('ai.actions')}:</div>
                                                {m.actions.map((a: any, j: number) => (
                                                    <div key={j} style={{ fontSize: '0.75rem', color: a.success ? 'var(--success-400)' : 'var(--danger-400)' }}>
                                                        {a.success ? '✓' : '✗'} {a.message}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.25rem' }}>
                                            {new Date(m.created_at).toLocaleTimeString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {sending && (
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--info-500), var(--info-600))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Bot size={16} />
                                    </div>
                                    <div style={{ padding: '0.75rem 1rem', borderRadius: '12px', background: 'var(--bg-tertiary)' }}>
                                        <div className="loading-spinner" style={{ width: '20px', height: '20px' }} />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEnd} />
                        </div>

                        {/* Input */}
                        <div style={{ padding: '0.75rem', borderTop: '1px solid var(--bg-tertiary)' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                                <textarea
                                    value={input} onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={t('ai.askPlaceholder')}
                                    rows={1}
                                    style={{
                                        flex: 1, background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                                        border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem 0.75rem',
                                        resize: 'none', fontFamily: 'inherit', fontSize: '0.875rem',
                                    }}
                                />
                                <button onClick={handleSend} disabled={sending || !input.trim()}
                                    style={{
                                        background: 'var(--primary-500)', border: 'none', borderRadius: '8px',
                                        padding: '0.5rem 1rem', color: 'white', cursor: 'pointer',
                                        opacity: sending || !input.trim() ? 0.5 : 1,
                                    }}>
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="empty-state" style={{ height: '100%' }}>
                        <MessageCircle size={48} />
                        <h3>{t('ai.adminAssistant')}</h3>
                        <p>{t('ai.assistantDesc')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
