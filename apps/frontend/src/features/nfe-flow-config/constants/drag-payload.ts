export const DRAG_STEP_KEY = 'application/nfe-step-key';
export const DRAG_STEP_NAME = 'application/nfe-step-name';
export const DRAG_STEP_PAYLOAD = 'application/nfe-step-payload';

export function parseDroppedStepData(dataTransfer: DataTransfer): {
  stepKey: string;
  name: string;
} | null {
  const stepKey = dataTransfer.getData(DRAG_STEP_KEY);
  const name = dataTransfer.getData(DRAG_STEP_NAME);

  if (stepKey && name) {
    return { stepKey, name };
  }

  const payload = dataTransfer.getData(DRAG_STEP_PAYLOAD);
  if (payload) {
    try {
      const parsed = JSON.parse(payload) as { stepKey?: string; name?: string };
      if (parsed.stepKey && parsed.name) {
        return { stepKey: parsed.stepKey, name: parsed.name };
      }
    } catch {
      return null;
    }
  }

  return null;
}
