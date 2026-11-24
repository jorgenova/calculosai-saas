import { useRef, useState } from 'react'
import { api } from '@/api/client'
import { Button, Input, Modal } from '@/design-system'

const regimes = [['mei', 'MEI'], ['simples_nacional', 'Simples Nacional'], ['lucro_presumido', 'Lucro Presumido'], ['lucro_real', 'Lucro Real']]
type Company = { id: string; name: string; current_tax_regime: string }

export function TaxRegimeModal({ company, onClose, onSaved }: { company: Company; onClose: () => void; onSaved: () => Promise<void> }) {
  const [regime, setRegime] = useState('')
  const [startDate, setStartDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    if (!regime || !startDate) { setError('Selecione o novo regime e informe a data de início.'); return }
    if (regime === company.current_tax_regime) { setError('Selecione um regime diferente do atual.'); return }
    submitting.current = true; setSaving(true); setError('')
    try {
      await api.officePost(`/companies/${company.id}/tax-regime`, { taxRegime: regime, startDate })
    } catch {
      setError('Não foi possível alterar o regime. Confira se a data é posterior ao início do regime atual e tente novamente.')
      submitting.current = false; setSaving(false); return
    }
    onClose()
    await onSaved()
  }
  return <Modal open onClose={() => { if (!submitting.current) onClose() }} title="Alterar regime tributário">
    <form onSubmit={submit} className="space-y-4">
      <div><p className="font-medium">{company.name}</p><p className="text-sm text-graphite-600 mt-1">Regime atual: {regimes.find(([value]) => value === company.current_tax_regime)?.[1] ?? company.current_tax_regime}</p></div>
      <label className="block text-xs font-medium text-graphite-600">Novo regime<select required className="input-field mt-1" value={regime} onChange={event => setRegime(event.target.value)}><option value="">Selecione um regime</option>{regimes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <Input label="Data de início" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} required />
      <p className="text-sm text-graphite-600">O regime atual será encerrado na véspera da data informada. O histórico será preservado.</p>
      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" loading={saving}>Salvar alteração</Button></div>
    </form>
  </Modal>
}
