import { useId } from 'react';
import Modal from '../../../components/Modal';
import { TaskItemForm } from './TaskItemForm';

// ── TaskEditorModal ───────────────────────────────────────────────────────────
// `TaskItemForm` inside a `Modal` whose footer holds the Cancel/Save pair, so
// the primary action stays pinned to the bottom of the sheet instead of
// scrolling off with the rest of the form.
//
// The submit button sits in the footer, outside the <form> element, and reaches
// it through the HTML `form=` attribute — hence the generated id shared between
// the two.
export function TaskEditorModal({
  title, saveLabel = 'Save Task', onClose, ...formProps
}) {
  const formId = useId();

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={onClose} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button type="submit" form={formId} className="app-btn-primary" style={{ flex: 1 }}>{saveLabel}</button>
        </div>
      }
    >
      <TaskItemForm id={formId} {...formProps} />
    </Modal>
  );
}
