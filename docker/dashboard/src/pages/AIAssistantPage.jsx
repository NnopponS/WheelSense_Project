import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Bot, Send, Sparkles, Lightbulb, Thermometer, Tv, Fan, Power, AlertTriangle } from 'lucide-react';
import { mcp } from '../services/api';

export function AIAssistantPage() {
    const { rooms, appliances, toggleAppliance, patients } = useApp();
    const [messages, setMessages] = useState([
        { id: 1, role: 'assistant', content: 'สวัสดีค่ะ! ฉันคือ WheelSense AI Assistant ยินดีให้บริการ 🤖\n\nคุณสามารถถามเกี่ยวกับ:\n• สถานะผู้ป่วยและ Wheelchair\n• ควบคุมเครื่องใช้ไฟฟ้า\n• ดูประวัติกิจกรรม\n• รับคำแนะนำด้านสุขภาพ\n\nลองถามได้เลยค่ะ!' }
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
                content: response.response || 'ขออภัย ไม่สามารถประมวลผลคำขอได้',
                toolResults: response.tool_results || []
            };
            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Chat error:', error);
            // Fallback to mock response
            const mockResponses = {
                'สถานะ': `📊 สถานะระบบปัจจุบัน:\n\n• ผู้ป่วยในระบบ: ${patients.length} คน\n• ห้องที่มีคนอยู่: ${rooms.filter(r => r.occupied).map(r => r.name).join(', ')}\n• อุปกรณ์ที่เปิดอยู่: ${Object.values(appliances).flat().filter(a => a.state).length} เครื่อง`,
                'เปิดไฟ': '💡 เปิดไฟห้องนอนให้แล้วค่ะ',
                'ปิดไฟ': '💡 ปิดไฟห้องนอนให้แล้วค่ะ',
                'แอร์': '❄️ เปิดแอร์ตั้งอุณหภูมิ 25°C ให้แล้วค่ะ',
                'ผู้ป่วย': `👥 รายชื่อผู้ป่วย:\n${patients.map(p => `• ${p.name} - ${p.condition}`).join('\n')}`,
            };

            let responseContent = 'ฉันเข้าใจคำถามของคุณค่ะ แต่ขณะนี้ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ AI ได้ กรุณาลองใหม่อีกครั้ง';

            for (const [key, value] of Object.entries(mockResponses)) {
                if (input.includes(key)) {
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
        { label: 'ดูสถานะทั้งหมด', action: 'แสดงสถานะทั้งหมด' },
        { label: 'เปิดไฟห้องนอน', action: 'เปิดไฟห้องนอน' },
        { label: 'ปิดเครื่องใช้ไฟฟ้าทั้งหมด', action: 'ปิดเครื่องใช้ไฟฟ้าทั้งหมด' },
        { label: 'โหมดนอนหลับ', action: 'ตั้งค่าโหมดนอนหลับ' },
        { label: 'ดูผู้ป่วยทั้งหมด', action: 'แสดงรายชื่อผู้ป่วย' },
    ];

    return (
        <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px - 3rem)', padding: 0 }}>
            <div style={{ padding: '1.5rem 1.5rem 0' }}>
                <div className="page-header">
                    <h2>🤖 AI Assistant</h2>
                    <p>พูดคุยกับ AI เพื่อควบคุมบ้านอัจฉริยะและรับข้อมูล</p>
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
                                            <small>✅ ดำเนินการแล้ว: {msg.toolResults.map(r => r.message || r.success).join(', ')}</small>
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
                            placeholder="พิมพ์ข้อความ... (เช่น เปิดไฟห้องนอน, ดูสถานะผู้ป่วย)"
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
                            <span className="card-title"><Sparkles size={18} /> Quick Actions</span>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {quickActions.map((qa, i) => (
                                <button
                                    key={i}
                                    className="btn btn-secondary"
                                    style={{ justifyContent: 'flex-start' }}
                                    onClick={() => handleQuickAction(qa.action)}
                                >
                                    {qa.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <span className="card-title"><Power size={18} /> Scene Control</span>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <button className="btn btn-primary" onClick={() => handleQuickAction('ตั้งค่าโหมดนอนหลับ')}>
                                🌙 โหมดนอน
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleQuickAction('ตั้งค่าโหมดตื่นนอน')}>
                                ☀️ โหมดตื่น
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleQuickAction('ตั้งค่าโหมดดูหนัง')}>
                                🎬 โหมดดูหนัง
                            </button>
                            <button className="btn btn-danger" onClick={() => handleQuickAction('ปิดเครื่องใช้ไฟฟ้าทั้งหมด')}>
                                ⏻ ปิดทั้งหมด
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
