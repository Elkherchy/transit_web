/**
 * Compatibilité @react-pdf/renderer avec React 19.
 * Le renderer appelle React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.hasOwnProperty(...)
 * qui peut être undefined sous React 19. On initialise l'objet avant le chargement du renderer.
 */
import React from 'react';

const r = React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: Record<string, unknown>;
};

if (
  !r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ||
  typeof r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.hasOwnProperty !== 'function'
) {
  r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ?? {};
  if (!r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher) {
    r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher = { current: null };
  }
  if (!r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentBatchConfig) {
    r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentBatchConfig = { suspense: null };
  }
}
