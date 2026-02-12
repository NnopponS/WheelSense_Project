'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Minimize2, Maximize2, Loader, MessageSquarePlus } from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import { sendChatMessage, ChatResponse } from '@/lib/api';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    actions?: { success: boolean; message: string }[];
    timestamp: Date;
}

export default function AIChatPopup() {
    const { role } = useWheelSenseStore();
    const { t, language } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'สวัสดีครับ! ผมคือ WheelSense AI Assistant 🤖\n\nผมสามารถช่วยคุณ:\n• ควบคุมอุปกรณ์ในบ้าน (เปิด/ปิดไฟ, แอร์)\n• ตรวจสอบตำแหน่งผู้ป่วย\n• ดูสถานะระบบ\n\nพิมพ์คำสั่งได้เลยครับ!',
            timestamp: new Date(),
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        const messageText = input.trim();
        setInput('');
        setLoading(true);

        try {
            const response = await sendChatMessage(messageText);

            if (response.data) {
                const assistantMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: response.data.response,
                    actions: response.data.actions,
                    timestamp: new Date(),
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: '⚠️ ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง',
                    timestamp: new Date(),
                }]);
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: '⚠️ ไม่สามารถเชื่อมต่อ AI Server ได้ กรุณาตรวจสอบ Backend',
                timestamp: new Date(),
            }]);
        }

        setLoading(false);
    };

    const handleNewChat = () => {
        if (confirm('เริ่มแชทใหม่?')) {
            setMessages([{
                id: '1',
                role: 'assistant',
                content: 'สวัสดีครับ! มีอะไรให้ช่วยไหมครับ? 🤖',
                timestamp: new Date(),
            }]);
        }
    };

    const quickActions = role === 'admin'
        ? ['ดูสถานะทั้งหมด', 'ปิดไฟทั้งหมด', 'วิเคราะห์พฤติกรรม']
        : ['ตำแหน่งของฉัน', 'ดูตารางวันนี้', 'ขอความช่วยเหลือ'];

    // FAB button when closed
    if (!isOpen) {
        return (
            <button
                className="ai-fab"
                onClick={() => setIsOpen(true)}
                title="AI Assistant"
            >
                <Bot size={24} />
                <span className="ai-fab-pulse"></span>
            </button>
        );
    }

    // Chat popup when open
    return (
        <div className={`ai-popup ${isMinimized ? 'minimized' : ''}`}>
            {/* Header */}
            <div className="ai-popup-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Bot size={18} color="white" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>WheelSense AI</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--success-400)' }}>● Online</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={handleNewChat} title="New Chat">
                        <MessageSquarePlus size={16} />
                    </button>
                    <button onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? 'Expand' : 'Minimize'}>
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button onClick={() => setIsOpen(false)} title="Close">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Messages */}
                    <div className="ai-popup-messages">
                        {messages.map(msg => (
                            <div key={msg.id} className={`ai-popup-message ${msg.role}`}>
                                {msg.role === 'assistant' && (
                                    <div className="ai-popup-avatar"><Bot size={14} /></div>
                                )}
                                <div className="ai-popup-bubble">
                                    {msg.content.split('\n').map((line, i) => (
                                        <span key={i}>{line}<br /></span>
                                    ))}
                                    {/* Action Results */}
                                    {msg.actions && msg.actions.length > 0 && (
                                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' }}>
                                            {msg.actions.map((action, idx) => (
                                                <div key={idx} style={{ color: action.success ? 'var(--success-400)' : 'var(--danger-400)' }}>
                                                    {action.success ? '✓' : '✗'} {action.message}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="ai-popup-message assistant">
                                <div className="ai-popup-avatar"><Bot size={14} /></div>
                                <div className="ai-popup-bubble">
                                    <div className="typing-dots">
                                        <span></span><span></span><span></span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Actions */}
                    <div className="ai-popup-quick">
                        {quickActions.map((action, i) => (
                            <button key={i} onClick={() => setInput(action)}>
                                {action}
                            </button>
                        ))}
                    </div>

                    {/* Input */}
                    <div className="ai-popup-input">
                        <input
                            type="text"
                            placeholder="พิมพ์ข้อความ..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            disabled={loading}
                        />
                        <button onClick={handleSend} disabled={loading || !input.trim()}>
                            {loading ? <Loader size={18} className="spin" /> : <Send size={18} />}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
