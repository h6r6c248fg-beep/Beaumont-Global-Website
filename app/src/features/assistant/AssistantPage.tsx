import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Sparkles, Plus, Trash2, Send, Bot, User as UserIcon, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { cx } from '@/lib/utils'
import type { AiConversation, AiMessage } from '@/types/database'

const SUGGESTED_PROMPTS = [
  'What does my day look like?',
  'Am I hitting my protein target today?',
  'Summarise my last workout',
  "What's due on my calendar this week?",
]

const CONFIG_ERROR_MESSAGE =
  'The assistant needs an Anthropic API key configured in Supabase — see the README.'

export function AssistantPage() {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const conversations = useQuery({
    queryKey: ['assistant', 'conversations', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', userId!)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AiConversation[]
    },
  })

  const messages = useQuery({
    queryKey: ['assistant', 'messages', selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', selectedId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as AiMessage[]
    },
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.data, selectedId])

  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_conversations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_void, id) => {
      queryClient.invalidateQueries({ queryKey: ['assistant', 'conversations', userId] })
      if (selectedId === id) setSelectedId(null)
    },
  })

  const [sending, setSending] = useState(false)

  const autoGrow = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  useEffect(() => {
    autoGrow()
  }, [draft])

  async function handleSend(promptOverride?: string) {
    const text = (promptOverride ?? draft).trim()
    if (!text || !userId || sending) return
    setSendError(null)
    setSending(true)
    setDraft('')

    try {
      let conversationId = selectedId

      if (!conversationId) {
        const title = text.length > 40 ? `${text.slice(0, 40)}…` : text
        const { data: convo, error: convoError } = await supabase
          .from('ai_conversations')
          .insert({ user_id: userId, title })
          .select('*')
          .single()
        if (convoError || !convo) throw convoError ?? new Error('Failed to create conversation')
        conversationId = (convo as AiConversation).id
        setSelectedId(conversationId)
        queryClient.invalidateQueries({ queryKey: ['assistant', 'conversations', userId] })
      }

      const { data: userMsg, error: userMsgError } = await supabase
        .from('ai_messages')
        .insert({ conversation_id: conversationId, user_id: userId, role: 'user', content: text })
        .select('*')
        .single()
      if (userMsgError || !userMsg) throw userMsgError ?? new Error('Failed to save message')

      await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)

      queryClient.invalidateQueries({ queryKey: ['assistant', 'messages', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['assistant', 'conversations', userId] })

      const priorMessages = (messages.data ?? []).map((m) => ({ role: m.role, content: m.content }))
      const history = [...priorMessages, { role: 'user' as const, content: text }]

      const { data: fnData, error: fnError } = await supabase.functions.invoke('ai-assistant', {
        body: { conversation_id: conversationId, messages: history },
      })

      if (fnError || !fnData || typeof fnData.reply !== 'string') {
        const raw = (fnData && (fnData as { error?: string }).error) || fnError?.message || ''
        if (/anthropic_api_key/i.test(raw) || !raw) {
          throw new Error(CONFIG_ERROR_MESSAGE)
        }
        throw new Error(raw)
      }

      const { error: assistantMsgError } = await supabase
        .from('ai_messages')
        .insert({ conversation_id: conversationId, user_id: userId, role: 'assistant', content: fnData.reply })
      if (assistantMsgError) throw assistantMsgError

      await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)

      queryClient.invalidateQueries({ queryKey: ['assistant', 'messages', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['assistant', 'conversations', userId] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSendError(/anthropic api key|anthropic_api_key/i.test(message) ? CONFIG_ERROR_MESSAGE : message || CONFIG_ERROR_MESSAGE)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const currentMessages = useMemo(() => messages.data ?? [], [messages.data])
  const showSuggestions = !selectedId || currentMessages.length === 0

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-7xl gap-6">
      {/* Conversation list sidebar */}
      <div className="hidden w-64 shrink-0 flex-col md:flex">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg text-[var(--color-paper)]">Conversations</h2>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mb-3 justify-center"
          onClick={() => {
            setSelectedId(null)
            setSendError(null)
          }}
        >
          <Plus className="h-3.5 w-3.5" /> New conversation
        </Button>
        <div className="flex-1 space-y-1 overflow-y-auto pr-1">
          {(conversations.data ?? []).map((c) => (
            <div
              key={c.id}
              className={cx(
                'group flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors',
                selectedId === c.id
                  ? 'border-[var(--color-gold-dim)] bg-[var(--color-gold)]/10'
                  : 'border-transparent bg-[var(--color-obsidian-2)] hover:border-[var(--color-line)]'
              )}
              onClick={() => {
                setSelectedId(c.id)
                setSendError(null)
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--color-paper)]">{c.title || 'New conversation'}</p>
                <p className="text-[11px] text-[var(--color-mist-2)]">
                  {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteConversation.mutate(c.id)
                }}
                className="shrink-0 rounded-md p-1 text-[var(--color-mist-2)] opacity-0 transition-opacity hover:bg-white/10 hover:text-[var(--color-rose)] group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {conversations.data?.length === 0 && (
            <p className="px-1 text-xs text-[var(--color-mist-2)]">No conversations yet.</p>
          )}
        </div>
      </div>

      {/* Main chat panel */}
      <div className="glass-panel flex min-w-0 flex-1 flex-col rounded-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--color-line-soft)] px-5 py-4">
          <Sparkles className="h-4 w-4 text-[var(--color-gold)]" />
          <h1 className="font-display text-base font-medium text-[var(--color-paper)]">
            {selectedId ? (conversations.data ?? []).find((c) => c.id === selectedId)?.title || 'Conversation' : 'Ask Meridian'}
          </h1>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {currentMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <EmptyState
                icon={<Sparkles className="h-8 w-8" strokeWidth={1.2} />}
                title="Your assistant knows your data"
                description="Calendar, macros, training, cycles and connected finance accounts — ask it anything about your own life."
              />
            </div>
          ) : (
            <div className="space-y-4">
              {currentMessages.map((m) => (
                <div key={m.id} className={cx('flex gap-3', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <div
                    className={cx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      m.role === 'user' ? 'bg-[var(--color-gold)]/20 text-[var(--color-gold-bright)]' : 'bg-white/5 text-[var(--color-mist)]'
                    )}
                  >
                    {m.role === 'user' ? <UserIcon className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  </div>
                  <div
                    className={cx(
                      'max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      m.role === 'user'
                        ? 'bg-[var(--color-gold)]/12 text-[var(--color-paper)] border border-[var(--color-gold)]/20'
                        : 'bg-[var(--color-panel-2)] text-[var(--color-paper)] border border-[var(--color-line)]'
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-[var(--color-mist)]">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-mist)]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-mist)] [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-mist)] [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>
          )}

          {sendError && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--color-rose)]/25 bg-[var(--color-rose)]/10 px-4 py-3 text-sm text-[var(--color-rose)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{sendError}</span>
            </div>
          )}
        </div>

        {showSuggestions && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-line-soft)] px-5 pt-4">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                disabled={sending}
                onClick={() => void handleSend(p)}
                className="rounded-full border border-[var(--color-line)] bg-[var(--color-obsidian-2)] px-3 py-1.5 text-xs text-[var(--color-mist)] transition-colors hover:border-[var(--color-gold-dim)] hover:text-[var(--color-paper)] disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 p-4">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your day, macros, training, cycles or finances…"
            disabled={sending}
            rows={1}
            className="max-h-[200px] flex-1"
          />
          <Button variant="primary" size="icon" disabled={sending || !draft.trim()} onClick={() => void handleSend()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
