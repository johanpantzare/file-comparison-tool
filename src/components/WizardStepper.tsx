import { Check } from 'lucide-react';

interface WizardStepperProps {
  currentStep: number;
  steps: string[];
  canVisitStep: (stepIndex: number) => boolean;
  onStepSelect: (stepIndex: number) => void;
}

export function WizardStepper({ currentStep, steps, canVisitStep, onStepSelect }: WizardStepperProps) {
  return (
    <ol className="stepper" aria-label="Helper steps">
      {steps.map((step, index) => {
        const complete = index < currentStep;
        const active = index === currentStep;
        const canVisit = canVisitStep(index);
        const shortLabel = shortStepLabel(step);
        return (
          <li className={`step ${active ? 'active' : ''} ${complete ? 'complete' : ''} ${canVisit ? 'available' : 'locked'}`} key={step}>
            <button
              className="step-button"
              type="button"
              disabled={!canVisit}
              aria-label={step}
              aria-current={active ? 'step' : undefined}
              onClick={() => onStepSelect(index)}
            >
              <span className="step-marker" aria-hidden="true">
                {complete ? <Check size={14} /> : index + 1}
              </span>
              <span className="step-label">{shortLabel}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function shortStepLabel(step: string): string {
  const [firstWord] = step.split(' ');
  return firstWord;
}
