import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Scale, LineChart as LineChartIcon } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatNumber, round } from '@/lib/utils'
import type { BodyWeightLog } from '@/types/database'

export function WeightPanel({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')

  const logsQuery = useQuery({
    queryKey: ['nutrition', 'weight-logs', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('body_weight_logs')
        .select('*')
        .eq('user_id', userId)
        .order('log_date', { ascending: false })
        .limit(30)
      if (error) throw error
      return ((data ?? []) as BodyWeightLog[]).slice().reverse()
    },
  })

  useEffect(() => {
    const todays = logsQuery.data?.find((l) => l.log_date === today)
    if (todays) {
      setWeight(String(todays.weight_kg))
      setBodyFat(todays.body_fat_pct != null ? String(todays.body_fat_pct) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsQuery.data])

  const save = useMutation({
    mutationFn: async () => {
      const weightKg = Number(weight)
      if (!weightKg || weightKg <= 0) throw new Error('Enter a valid weight')
      const { error } = await supabase.from('body_weight_logs').upsert(
        {
          user_id: userId,
          log_date: today,
          weight_kg: weightKg,
          body_fat_pct: bodyFat.trim() === '' ? null : Number(bodyFat),
        },
        { onConflict: 'user_id,log_date' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'weight-logs', userId] })
    },
  })

  const chartData = (logsQuery.data ?? []).map((l) => ({
    date: format(new Date(`${l.log_date}T00:00:00`), 'd MMM'),
    weight_kg: l.weight_kg,
  }))

  const latest = logsQuery.data?.[logsQuery.data.length - 1]
  const first = logsQuery.data?.[0]
  const delta = latest && first && logsQuery.data && logsQuery.data.length > 1 ? latest.weight_kg - first.weight_kg : null

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Body weight</PanelTitle>
        <Scale className="h-4 w-4 text-[var(--color-mist)]" />
      </PanelHeader>
      <PanelBody className="space-y-5">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!save.isPending) save.mutate()
          }}
        >
          <Field label="Weight (kg)">
            <Input
              type="number"
              min="0"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="82.4"
            />
          </Field>
          <Field label="Body fat % (optional)">
            <Input
              type="number"
              min="0"
              step="0.1"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              placeholder="—"
            />
          </Field>
          <div className="col-span-2">
            {save.isError && (
              <p className="mb-2 text-xs text-[var(--color-rose)]">
                {(save.error as Error)?.message || "Couldn't save your weight."}
              </p>
            )}
            <Button type="submit" variant="secondary" size="sm" className="w-full justify-center" loading={save.isPending}>
              Save today&apos;s weight
            </Button>
          </div>
        </form>

        <div className="border-t border-[var(--color-line)] pt-4">
          {logsQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-[var(--color-mist)]">Loading history…</p>
          ) : chartData.length === 0 ? (
            <EmptyState
              icon={<LineChartIcon className="h-7 w-7" strokeWidth={1.2} />}
              title="No history yet"
              description="Log your weight to start tracking trends over time."
            />
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-xs text-[var(--color-mist)]">Last {chartData.length} entries</p>
                {delta != null && (
                  <p className={delta <= 0 ? 'text-xs text-[var(--color-emerald)]' : 'text-xs text-[var(--color-rose)]'}>
                    {delta > 0 ? '+' : ''}
                    {formatNumber(round(delta, 1), 1)} kg
                  </p>
                )}
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-line-soft)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'var(--color-mist-2)', fontSize: 10 }}
                      axisLine={{ stroke: 'var(--color-line)' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: 'var(--color-mist-2)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      domain={['dataMin - 1', 'dataMax + 1']}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-obsidian-2)',
                        border: '1px solid var(--color-line)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--color-paper)',
                      }}
                      labelStyle={{ color: 'var(--color-mist)' }}
                      formatter={(value: number) => [`${value} kg`, 'Weight']}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight_kg"
                      stroke="var(--color-gold)"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: 'var(--color-gold)', strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </PanelBody>
    </Panel>
  )
}
