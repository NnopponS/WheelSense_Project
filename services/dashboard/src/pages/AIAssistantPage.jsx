import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Bot, Send, Sparkles, Lightbulb, Thermometer, Tv, Fan, Power, AlertTriangle } from 'lucide-react';
import { mcp } from '../services/api';

export function AIAssistantPage() {
    const { rooms, appliances, toggleAppliance, patients, language } = useApp();
    const { t } = useTranslation(language);
    const [messages, setMessages] = useState([
        { id: 1, role: 'assistant', content: 'Hello! I\'m WheelSense AI Assistant, ready to help 🤖\n\nYou can ask about:\n• Patient and Wheelchair status\n• Control appliances\n• View activity history\n• Get health recommendations\n\nFeel free to ask me anything!' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = { id: Date.now(), role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            // Call MCP server chat endpoint
            const response = await mcp.chat([
                { role: 'user', content: input }
            ], ['control_appliance', 'get_room_status', 'get_user_location', 'set_scene', 'send_emergency']);

            const assistantMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: response.response || 'Sorry, I couldn\'t process your request',
                toolResults: response.tool_results || []
            };
            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Chat error:', error);
            // Fallback to mock response
            const mockResponses = {
                'status': `📊 Current System Status:\n\n• Patients in system: ${patients.length}\n• Occupied rooms: ${rooms.filter(r => r.occupied).map(r => r.name).join(', ')}\n• Active appliances: ${Object.values(appliances).flat().filter(a => a.state).length} devices`,
                'turn on light': '💡 Turned on bedroom light',
                'turn off light': '💡 Turned off bedroom light',
                'AC': '❄️ Turned on AC, set temperature to 25°C',
                'patient': `👥 Patient List:\n${patients.map(p => `• ${p.name} - ${p.condition}`).join('\n')}`,
            };

            let responseContent = 'I understand your question, but I cannot connect to the AI server right now. Please try again later.';

            for (const [key, value] of Object.entries(mockResponses)) {
                if (input.toLowerCase().includes(key.toLowerCase())) {
                    responseContent = value;
                    break;
                }
            }

            setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: responseContent }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickAction = async (action) => {
        setInput(action);
        // Auto send after setting
        setTimeout(() => document.querySelector('.chat-send-btn')?.click(), 100);
    };

    const quickActions = [
        { label: 'View All Status', action: 'Show all status' },
        { label: 'Turn On Bedroom Light', action: 'Turn on bedroom light' },
        { label: 'Turn Off All Appliances', action: 'Turn off all appliances' },
        { label: 'Sleep Mode', action: 'Set sleep mode' },
        { label: 'View All Patients', action: 'Show patient list' },
    ];

    return (
        <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px - 3rem)', padding: 0 }}>
            <div style={{ padding: '1.5rem 1.5rem 0' }}>
                <div className="page-header">
                    <h2>🤖 {t('AI Assistant')}</h2>
                    <p>{t('Chat with AI to control smart home and get information')}</p>
                </div>
            </div>

            <div style={{ display: 'flex', flex: 1, gap: '1.5rem', padding: '0 1.5rem 1.5rem', overflow: 'hidden' }}>
                {/* Chat Area */}
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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

                {/* Quick Actions Sidebar */}
                <div style={{ width: '280px', flexShrink: 0 }}>
                    <div className="card" style={{ marginBottom: '1rem' }}>
                        <div className="card-header">
                            <span className="card-title"><Sparkles size={18} /> {t('Quick Actions')}</span>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {quickActions.map((qa, i) => (
                                <button
                                    key={i}
                                    className="btn btn-secondary"
                                    style={{ justifyContent: 'flex-start' }}
                                    onClick={() => handleQuickAction(qa.action)}
                                >
                                    {t(qa.label)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <span className="card-title"><Power size={18} /> {t('Scene Control')}</span>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <button className="btn btn-primary" onClick={() => handleQuickAction('Set sleep mode')}>
                                🌙 {t('Sleep Mode')}
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleQuickAction('Set wake up mode')}>
                                ☀️ {t('Wake Up Mode')}
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleQuickAction('Set movie mode')}>
                                🎬 {t('Movie Mode')}
                            </button>
                            <button className="btn btn-danger" onClick={() => handleQuickAction('Turn off all appliances')}>
                                ⏻ {t('Turn Off All')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
