import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Send, Mic, Bot, User } from 'lucide-react'

// ---- Types ----
interface Message {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: number // store as epoch ms for reliable formatting
}

// ---- Utils ----
const makeId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString()

export function AIAssistantChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  // auto-scroll to bottom when messages change
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    // ScrollArea wraps content; select the viewport if available
    const viewport = el.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null
    const target = viewport ?? el
    target.scrollTo({ top: target.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // derived state: disable send when empty
  const canSend = useMemo(() => inputText.trim().length > 0, [inputText])

  const pushMessage = (m: Omit<Message, 'id' | 'timestamp'> & Partial<Pick<Message, 'id' | 'timestamp'>>) => {
    const msg: Message = {
      id: m.id ?? makeId(),
      timestamp: m.timestamp ?? Date.now(),
      sender: m.sender,
      text: m.text,
    }
    setMessages(prev => [...prev, msg])
  }

  const handleSend = () => {
    if (!canSend) return

    const text = inputText.trim()
    setInputText('')

    // 1) push user message
    pushMessage({ sender: 'user', text })

    // 2) push a minimal placeholder assistant reply (demo). Replace with your real API call later.
    //    We add a small delay to simulate latency and keep UI responsive.
    setTimeout(() => {
      pushMessage({ sender: 'assistant', text: 'กำลังประมวลผล…' })
    }, 400)
  }

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = e => {
    // use onKeyDown (onKeyPress is deprecated) and allow Shift+Enter for multiline in a Textarea (future)
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="w-full max-w-[1280px] h-[900px] bg-white shadow-xl rounded-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0056B3] to-[#00945E] text-white p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center" aria-hidden>
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold leading-tight english-text">WheelSense Assistant</h2>
            <p className="text-sm opacity-90 thai-text">ตัวช่วยระบบ</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-6">
        <div ref={listRef} className="space-y-4 max-w-4xl mx-auto" aria-live="polite" aria-relevant="additions" aria-label="message list">
            {messages.length === 0 ? (
            <div className="text-center text-muted-foreground select-none">ยังไม่มีการสนทนา — พิมพ์ข้อความด้านล่างเพื่อเริ่ม</div>
            ) : (
            messages.map((message: Message) => (
              <div key={message.id} className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {/* Assistant avatar */}
              {message.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-[#00945E] flex items-center justify-center flex-shrink-0 mt-1" aria-hidden>
                <Bot className="w-5 h-5 text-white" />
                </div>
              )}

              {/* Bubble */}
              <div className={`max-w-[70%] ${message.sender === 'user' ? 'order-1' : 'order-2'}`}>
                <div
                className={`rounded-2xl px-4 py-3 ${
                  message.sender === 'user'
                  ? 'bg-[#e8f4ff] text-[#0056B3] rounded-tr-sm'
                  : 'bg-[#f0fdf4] text-gray-800 rounded-tl-sm'
                }`}
                role="group"
                aria-label={message.sender === 'user' ? 'ข้อความจากผู้ใช้' : 'ข้อความจากผู้ช่วย'}
                >
                <p className="whitespace-pre-line leading-relaxed english-text">{message.text}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1 px-2">{fmtTime(message.timestamp)}</p>
              </div>

              {/* User avatar */}
              {message.sender === 'user' && (
                <div className="w-8 h-8 rounded-full bg-[#0056B3] flex items-center justify-center flex-shrink-0 mt-1 order-2" aria-hidden>
                <User className="w-5 h-5 text-white" />
                </div>
              )}
              </div>
            ))
            )}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="border-t bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-2">
              <form
                className="flex gap-2"
                onSubmit={e => {
                  e.preventDefault()
                  handleSend()
                }}
                aria-label="ส่งข้อความไปยังผู้ช่วย"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 text-[#00945E] hover:text-[#00945E] hover:bg-[#00945E]/10"
                  aria-label="เริ่มบันทึกเสียง"
                >
                  <Mic className="h-5 w-5" />
                </Button>

                <Input
                  placeholder="พิมพ์ข้อความ..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={onKeyDown}
                  className="flex-1 border-0 focus-visible:ring-0 english-text"
                  aria-label="กล่องพิมพ์ข้อความ"
                  autoComplete="off"
                />

                <Button
                  type="submit"
                  size="icon"
                  className="flex-shrink-0 bg-[#0056B3] hover:bg-[#004494] disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="ส่งข้อความ"
                  disabled={!canSend}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
