'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { CreateProjectStep } from '../model/create-project.data';
import type { CreateProjectFormState } from '../model/create-project.types';
import {
  getStepDescription,
  getStepHeading,
} from '../lib/create-project.helpers';
import { RoomTypeStep } from './steps/room-type-step';
import { GeometryStep } from './steps/geometry-step';
import { StyleStep } from './steps/style-step';
import { BudgetStep } from './steps/budget-step';
import { PhotoStep } from './steps/photo-step';
import { FinalStep } from './steps/final-step';

type CreateProjectStepContentProps = {
  step: CreateProjectStep;
  form: CreateProjectFormState;
  onChange: Dispatch<SetStateAction<CreateProjectFormState>>;
  onSkipPhoto: () => void;
};

export function CreateProjectStepContent({
  step,
  form,
  onChange,
  onSkipPhoto,
}: CreateProjectStepContentProps) {
  return (
    <>
      <div className="mb-6">
        <p className="rv-eyebrow mb-3">Шаг {step} из 6</p>

        <h1 className="max-w-4xl text-section-title text-ink">
          {getStepHeading(step)}
        </h1>

        <p className="mt-3 max-w-2xl text-body-lg text-ink-soft">
          {getStepDescription(step)}
        </p>
      </div>

      {step === 1 ? <RoomTypeStep form={form} onChange={onChange} /> : null}
      {step === 2 ? <GeometryStep form={form} onChange={onChange} /> : null}
      {step === 3 ? <StyleStep form={form} onChange={onChange} /> : null}
      {step === 4 ? <BudgetStep form={form} onChange={onChange} /> : null}
      {step === 5 ? (
        <PhotoStep form={form} onChange={onChange} onSkipPhoto={onSkipPhoto} />
      ) : null}
      {step === 6 ? <FinalStep form={form} /> : null}
    </>
  );
}
