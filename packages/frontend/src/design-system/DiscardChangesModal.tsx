import { Button } from './Button'
import { Modal } from './Modal'

export function DiscardChangesModal({ open, onCancel, onDiscard }: { open: boolean; onCancel: () => void; onDiscard: () => void }) {
  return <Modal open={open} onClose={onCancel} title="Descartar alterações?">
    <p className="text-sm text-graphite-600">Você tem alterações que ainda não foram salvas. Se continuar, elas serão perdidas.</p>
    <div className="flex flex-wrap justify-end gap-2 mt-5">
      <Button type="button" variant="secondary" onClick={onCancel}>Continuar editando</Button>
      <Button type="button" variant="danger" onClick={onDiscard}>Descartar alterações</Button>
    </div>
  </Modal>
}
