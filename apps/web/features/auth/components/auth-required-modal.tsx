'use client';

import type { AuthMode, AuthReason } from '../model/auth.types';
import { AuthModal } from './auth-modal';

type AuthRequiredModalProps = {
  open: boolean;
  reason?: AuthReason;
  initialMode?: AuthMode;
  onClose: () => void;
  onSuccess: () => void;
};

export function AuthRequiredModal({
  open,
  reason,
  initialMode = 'register',
  onClose,
  onSuccess,
}: AuthRequiredModalProps) {
  return (
    <AuthModal
      open={open}
      reason={reason}
      initialMode={initialMode}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
