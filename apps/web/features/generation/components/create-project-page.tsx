'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  createGeneration,
  ensureGuestSession,
  uploadRoomImage,
} from '../api/generation-api';
import {
  type CreateProjectStep,
  CREATE_PROJECT_STEPS,
} from '../model/create-project.data';
import type { CreateProjectFormState } from '../model/create-project.types';
import {
  canProceed,
  getProjectBrief,
  toCentimeters,
} from '../lib/create-project.helpers';
import { CreateProjectTopbar } from './create-project-topbar';
import { ProjectBrief } from './project-brief';
import { CreateProjectStepContent } from './create-project-step-content';
import { CreateProjectNavigation } from './create-project-navigation';
import { useCurrentUserQuery } from '@/features/auth/api/auth-queries';
import { ApiError } from '@/shared/api/api-client';
import { AuthRequiredModal } from '@/features/auth/components/auth-required-modal';

const INITIAL_FORM: CreateProjectFormState = {
  roomType: null,
  width: null,
  depth: null,
  height: null,
  style: null,
  budgetMax: 150000,
  sourceImageFile: null,
};

export function CreateProjectPage() {
  const router = useRouter();

  const [step, setStep] = useState<CreateProjectStep>(1);
  const [form, setForm] = useState<CreateProjectFormState>(INITIAL_FORM);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const currentUserQuery = useCurrentUserQuery();

  const brief = useMemo(() => getProjectBrief(form), [form]);

  const generationMutation = useMutation({
    mutationFn: async () => {
      if (
        !form.roomType ||
        !form.style ||
        !form.budgetMax ||
        !form.width ||
        !form.height ||
        !form.depth
      ) {
        throw new Error('Заполните обязательные поля');
      }

      if (!currentUserQuery.data) {
        await ensureGuestSession();
      }

      let sourceImageUrl: string | undefined;

      if (form.sourceImageFile) {
        const uploaded = await uploadRoomImage(form.sourceImageFile);
        sourceImageUrl = uploaded.file.url;
      }

      return createGeneration({
        roomType: form.roomType,
        style: form.style,
        title: `${brief[0].value} в стиле ${brief[2].value}`,
        budgetMax: form.budgetMax,
        widthCm: toCentimeters(form.width),
        depthCm: toCentimeters(form.depth),
        heightCm: toCentimeters(form.height),
        sourceImageUrl,
      });
    },
    onSuccess: (data) => {
      router.push(`/generation/${data.job.id}?projectId=${data.project.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const isGuestLimitError =
          error.status === 401 ||
          error.status === 403 ||
          error.status === 429 ||
          error.message.toLowerCase().includes('limit') ||
          error.message.toLowerCase().includes('guest');

        if (isGuestLimitError) {
          setAuthModalOpen(true);
        }
      }
    },
  });

  const goNext = () => {
    if (step < CREATE_PROJECT_STEPS.length) {
      setStep((step + 1) as CreateProjectStep);
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep((step - 1) as CreateProjectStep);
    }
  };

  const goToStep = (nextStep: CreateProjectStep) => {
    if (nextStep <= step) {
      setStep(nextStep);
    }
  };

  return (
    <div className="min-h-full bg-white">
      <CreateProjectTopbar step={step} />

      <div className="rv-container-wide grid gap-12 py-6 lg:grid-cols-[380px_1fr]">
        <ProjectBrief brief={brief} currentStep={step} onStepClick={goToStep} />

        <div className="min-w-0">
          <CreateProjectStepContent
            step={step}
            form={form}
            onChange={setForm}
            onSkipPhoto={goNext}
          />

          <CreateProjectNavigation
            step={step}
            canGoNext={canProceed(step, form)}
            isSubmitting={generationMutation.isPending}
            errorMessage={generationMutation.error?.message}
            onBack={goBack}
            onNext={goNext}
            onGenerate={() => generationMutation.mutate()}
          />
        </div>
      </div>

      <AuthRequiredModal
        open={authModalOpen}
        reason="guest-generation-limit"
        initialMode="register"
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          setAuthModalOpen(false);
          generationMutation.mutate();
        }}
      />
    </div>
  );
}
