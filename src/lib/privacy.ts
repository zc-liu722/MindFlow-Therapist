import type { UserRecord } from "@/lib/types";

export const CONSENT_VERSION = "2026-03-23";

export function hasRequiredConsents(user: UserRecord | null | undefined) {
  return Boolean(
    user &&
      user.consentVersion === CONSENT_VERSION &&
      user.privacyConsentAt &&
      user.aiProcessingConsentAt
  );
}

export function assertRequiredConsents(user: UserRecord | null | undefined) {
  if (!hasRequiredConsents(user)) {
    throw new Error("CONSENT_REQUIRED");
  }
}

export function validateConsentInput(input: {
  privacyConsent?: boolean;
  aiProcessingConsent?: boolean;
}) {
  if (!input.privacyConsent) {
    throw new Error("PRIVACY_CONSENT_REQUIRED");
  }

  if (!input.aiProcessingConsent) {
    throw new Error("AI_CONSENT_REQUIRED");
  }
}
