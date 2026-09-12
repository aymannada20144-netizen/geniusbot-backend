'use strict';

const EXPLICIT_SERVICE_OUT_OF_CATALOG = 'EXPLICIT_SERVICE_OUT_OF_CATALOG';

function explicitServiceOutOfCatalog({ semanticResult, subject, resolution }) {
  if (
    semanticResult?.contractValid !== true ||
    semanticResult?.result?.status !== 'UNDERSTOOD' ||
    subject?.kind !== 'SERVICE_OR_NEED' ||
    subject?.source !== 'CURRENT' ||
    subject?.referenceType !== 'IDENTITY' ||
    resolution?.decision !== 'NOT_FOUND' ||
    typeof subject.surface !== 'string' ||
    !subject.surface
  ) return null;
  return Object.freeze({
    kind: EXPLICIT_SERVICE_OUT_OF_CATALOG,
    surface: subject.surface,
  });
}

module.exports = Object.freeze({
  EXPLICIT_SERVICE_OUT_OF_CATALOG,
  explicitServiceOutOfCatalog,
});
