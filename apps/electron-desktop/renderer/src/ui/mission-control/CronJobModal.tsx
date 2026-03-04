import React from "react";
import { Modal } from "@shared/kit/Modal";
import { TextInput, CheckboxRow } from "@shared/kit/forms";
import { PrimaryButton, SecondaryButton, ButtonRow } from "@shared/kit/buttons";

export type CronJobFormData = {
  id: string;
  name: string;
  schedule: string;
  isolatedSession: boolean;
};

export function CronJobModal(props: {
  open: boolean;
  onClose: () => void;
  onSave: (job: CronJobFormData) => void;
  onDelete?: () => void;
  initial?: CronJobFormData;
}) {
  const isEdit = !!props.initial;
  const [name, setName] = React.useState(props.initial?.name ?? "");
  const [schedule, setSchedule] = React.useState(props.initial?.schedule ?? "");
  const [isolated, setIsolated] = React.useState(props.initial?.isolatedSession ?? true);

  React.useEffect(() => {
    if (props.open) {
      setName(props.initial?.name ?? "");
      setSchedule(props.initial?.schedule ?? "");
      setIsolated(props.initial?.isolatedSession ?? true);
    }
  }, [props.open, props.initial]);

  const valid = name.trim().length > 0 && schedule.trim().length > 0;

  const handleSave = () => {
    if (!valid) return;
    props.onSave({
      id: props.initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      schedule: schedule.trim(),
      isolatedSession: isolated,
    });
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      header={isEdit ? "Editar rotina cron" : "Nova rotina cron"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <TextInput
          label="Nome da rotina"
          value={name}
          onChange={setName}
          placeholder="ex.: Backup diário no GitHub"
        />
        <TextInput
          label="Agenda cron"
          value={schedule}
          onChange={setSchedule}
          placeholder="ex.: 0 2 * * *"
        />
        <CheckboxRow checked={isolated} onChange={setIsolated}>
          Executar em sessão isolada
        </CheckboxRow>
        <ButtonRow>
          <PrimaryButton onClick={handleSave} disabled={!valid}>
            {isEdit ? "Salvar" : "Criar"}
          </PrimaryButton>
          {isEdit && props.onDelete && (
            <SecondaryButton onClick={props.onDelete}>Excluir</SecondaryButton>
          )}
        </ButtonRow>
      </div>
    </Modal>
  );
}
