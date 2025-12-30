import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Bot, Send, Maximize2, Minimize2 } from 'lucide-react';
import * as api from '../services/api';

export function AIAssistantPage() {
    const { rooms, appliances, toggleAppliance, patients, language } = useApp();
    const { t } = useTranslation(language);
    const [messages, setMessages] = useState([
        { id: 1, role: 'assistant', content: 'Hello! I\'m WheelSense AI Assistant, ready to help 🤖\n\nYou can ask about:\n• Patient and Wheelchair status\n• Control appliances\n• View activity history\n• Get health recommendations\n\nFeel free to ask me anything!' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        const messageText = input;
        if (!messageText.trim() || isLoading) return;

        const userMessage = { id: Date.now(), role: 'user', content: messageText };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            // Use shared AI chat API (same backend as floating AI assistant)
            const response = await api.chat(
                [{ role: 'user', content: messageText }],
                [
                    'control_appliance',
                    'get_room_status',
                    'get_user_location',
                    'set_scene',
                    'send_emergency',
                    'get_user_routines',
                    'add_routine',
                    'analyze_behavior',
                    'get_doctor_notes'
                ]
            );

            let responseText = response.response || 'Sorry, unable to process your request';

            // If backend returns an error message string, treat it as error and use fallback
            if (responseText.includes('Error:') || responseText.toLowerCase().includes('error:')) {
                throw new Error(responseText);
            }

            const assistantMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: responseText,
                toolResults: response.tool_results || []
            };
            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Chat error:', error);

            // Extract error message
            const errorMessage = error.message || 'Unknown error';
            const lowerErrorMessage = errorMessage.toLowerCase();

            // Detect connection-related errors
            const is404 = lowerErrorMessage.includes('404') || lowerErrorMessage.includes('not found');
            const is503 = lowerErrorMessage.includes('503') || lowerErrorMessage.includes('service unavailable');
            const isConnectionError =
                is404 ||
                is503 ||
                lowerErrorMessage.includes('network') ||
                lowerErrorMessage.includes('fetch') ||
                lowerErrorMessage.includes('ollama');

            // Pure error message – no hardcoded AI logic or mock answers
            let responseContent;
            if (isConnectionError) {
                responseContent =
                    `⚠️ Unable to connect to AI server.\n` +
                    `Details: ${errorMessage}\n` +
                    `Please check the backend service or your network and try again.`;
            } else {
                responseContent =
                    `⚠️ AI error: ${errorMessage}\n` +
                    `Please try again or contact the system administrator.`;
            }

            setMessages(prev => [
                ...prev,
                { id: Date.now() + 1, role: 'assistant', content: responseContent }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    return (
        <div
            className="page-content"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: isFullscreen ? '100vh' : 'calc(100vh - 64px - 3rem)',
                padding: isFullscreen ? 0 : undefined,
                position: isFullscreen ? 'fixed' : 'relative',
                top: isFullscreen ? 0 : 'auto',
                left: isFullscreen ? 0 : 'auto',
                right: isFullscreen ? 0 : 'auto',
                bottom: isFullscreen ? 0 : 'auto',
                zIndex: isFullscreen ? 9999 : 'auto',
                background: isFullscreen ? 'var(--bg-primary)' : undefined
            }}
        >
            {!isFullscreen && (
                <div style={{ padding: '1.5rem 1.5rem 0' }}>
                    <div className="page-header">
                        <h2>🤖 {t('AI Assistant')}</h2>
                        <p>{t('Chat with AI to control smart home and get information')}</p>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flex: 1, padding: isFullscreen ? '0' : '0 1.5rem 1.5rem', overflow: 'hidden' }}>
                {/* Chat Area - Full Width */}
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: isFullscreen ? 0 : undefined }}>
                    {/* Header with Fullscreen Toggle */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Bot size={20} />
                            <span style={{ fontWeight: 600 }}>{t('AI Assistant')}</span>
                        </div>
                        <button
                            className="btn btn-icon"
                            onClick={toggleFullscreen}
                            title={isFullscreen ? t('Exit Fullscreen') : t('Fullscreen')}
                            style={{ padding: '0.5rem' }}
                        >
                            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>
                    </div>

                    <div className="chat-messages" style={{ flex: 1, overflowY: 'auto' }}>
                        {messages.map(msg => (
                            <div key={msg.id} className={`chat-message ${msg.role}`}>
                                <div className={`chat-avatar ${msg.role}`}>
                                    {msg.role === 'assistant' ? <Bot size={18} /> : <span>👤</span>}
                                </div>
                                <div className="chat-bubble">
                                    {msg.content.split('\n').map((line, i) => (
                                        <React.Fragment key={i}>{line}<br /></React.Fragment>
                                    ))}
                                    {msg.toolResults && msg.toolResults.length > 0 && (
                                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(99, 102, 241, 0.2)', borderRadius: '0.5rem' }}>
                                            <small>✅ Action completed: {msg.toolResults.map(r => r.message || r.success).join(', ')}</small>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="chat-message assistant">
                                <div className="chat-avatar"><Bot size={18} /></div>
                                <div className="chat-bubble">
                                    <div className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="chat-input-container">
                        <input
                            type="text"
                            className="chat-input"
                            placeholder={t('Type a message... (e.g. Turn on bedroom light, Show patient status)')}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            disabled={isLoading}
                        />
                        <button className="chat-send-btn" onClick={handleSend} disabled={isLoading}>
                            <Send size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

