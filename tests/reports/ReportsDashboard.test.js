'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Reports V1 dashboard contract', () => {
  test('replaces the placeholder with operational sections and no revenue or PII', () => {
    const page = read('geniusbot-dashboard/src/pages/dashboard/ReportsPage.tsx');
    assert.doesNotMatch(page, /No reports are currently available/);
    for (const label of [
      'Appointment summary',
      'Appointments and new bookings trend',
      'Appointment breakdown',
      'Patient summary',
      'Conversation operations',
    ]) assert.match(page, new RegExp(label));
    assert.doesNotMatch(page, /patientName|phoneNumber|whatsappId|quotedPrice/);
    assert.match(page, /Revenue and patient details are not included/);
  });

  test('guards both the route and sidebar with operational report permission mapping', () => {
    const routes = read('geniusbot-dashboard/src/routes/AppRoutes.tsx');
    const sidebar = read('geniusbot-dashboard/src/components/layout/AppSidebar.tsx');
    const permission = read('geniusbot-dashboard/src/auth/reportPermissions.ts');
    assert.match(routes, /ReportsPermissionGuard><ReportsPage/);
    assert.match(sidebar, /canViewOperationalReports/);
    assert.match(permission, /report:view_operational/);
    assert.match(permission, /permissions\?\.includes/);
    assert.doesNotMatch(permission, /branch_manager|receptionist|doctor/);
  });

  test('uses scoped cache keys, URL filters, independent retries and accessible trend fallback', () => {
    const page = read('geniusbot-dashboard/src/pages/dashboard/ReportsPage.tsx');
    assert.match(page, /\['reports', clinicId, effectiveApplied\]/);
    assert.match(page, /setSearchParams/);
    assert.match(page, /summary\.refetch/);
    assert.match(page, /trend\.refetch/);
    assert.match(page, /breakdown\.refetch/);
    assert.match(page, /className="sr-only"/);
    assert.match(page, /role="img"/);
  });

  test('API uses endpoint-specific builders and never leaks the UI preset', () => {
    const api = read('geniusbot-dashboard/src/api/reportsApi.ts');
    assert.match(api, /COMMON_FILTER_KEYS/);
    assert.match(api, /summaryParameters/);
    assert.match(api, /trendParameters/);
    assert.match(api, /breakdownParameters/);
    assert.match(api, /patientParameters/);
    assert.match(api, /conversationParameters/);
    assert.doesNotMatch(api, /preset/);
    assert.match(api, /typeof entry\[1\] === 'string' && entry\[1\]\.length > 0/);
    for (const route of [
      'appointments/summary',
      'appointments/trend',
      'appointments/breakdown',
      'patients/summary',
      'conversations/summary',
    ]) assert.match(api, new RegExp(route));
  });

  test('initial applied filters remove preset before all five queries run', () => {
    const page = read('geniusbot-dashboard/src/pages/dashboard/ReportsPage.tsx');
    assert.match(page, /function appliedFilters\(draft: DraftFilters\)/);
    assert.match(page, /from: draft\.from/);
    assert.match(page, /status: draft\.status/);
    assert.match(page, /useState<ReportFilters>\(\(\) => appliedFilters\(initial\)\)/);
  });

  test('renders checked-in summary, filter, and breakdown data', () => {
    const page = read('geniusbot-dashboard/src/pages/dashboard/ReportsPage.tsx');
    const api = read('geniusbot-dashboard/src/api/reportsApi.ts');
    assert.match(page, /'Checked in', summary\.data\.data\.checkedIn/);
    assert.match(page, /'checked_in'/);
    assert.match(page, /row\.checkedIn/);
    assert.match(api, /checkedIn: number/);
  });

  test('keeps page width bounded and confines horizontal scrolling to data regions', () => {
    const css = read('geniusbot-dashboard/src/pages/dashboard/ReportsPage.css');
    assert.match(css, /\.reports-page \{[^}]*max-width: 100%[^}]*min-width: 0/);
    assert.doesNotMatch(css, /\.reports-page \{[^}]*overflow-x:\s*(hidden|clip)/);
    assert.match(css, /\.reports-page,\s*\.reports-page \*,[\s\S]*box-sizing: border-box/);
    assert.match(css, /\.reports-table-wrap \{[^}]*overflow-x: auto/);
    assert.match(css, /\.reports-chart \{[^}]*overflow-x: auto/);
    assert.match(css, /\.reports-filters input,[\s\S]*\.reports-filters select \{[^}]*width: 100%[^}]*max-width: 100%[^}]*min-width: 0/);
    assert.match(css, /\.reports-summary,[\s\S]*\.reports-mini-grid \{[^}]*min-width: 0[^}]*repeat\(auto-fit/);
  });

  test('uses the approved explicit patient and conversation labels', () => {
    const page = read('geniusbot-dashboard/src/pages/dashboard/ReportsPage.tsx');
    for (const label of [
      'New patient records',
      'Patients with appointments',
      'First-time booked patients',
      'Returning booked patients',
      'Total conversations',
      'Human takeovers',
      'AI-present conversations',
    ]) assert.match(page, new RegExp(`'${label}'`));
    assert.doesNotMatch(page, /replace\(\/\(\[A-Z\]\)\/g/);
  });

  test('the dashboard layout does not create a page-wide horizontal scroll container', () => {
    const layout = read('geniusbot-dashboard/src/styles/layout.css');
    const global = read('geniusbot-dashboard/src/styles/global.css');
    assert.match(layout, /grid-template-columns: var\(--sidebar-width\) minmax\(0, 1fr\)/);
    assert.match(layout, /\.dashboard-layout \{[^}]*max-width: 100%[^}]*min-width: 0/);
    assert.match(layout, /\.dashboard-main \{[^}]*max-width: 100%[^}]*min-width: 0/);
    assert.match(layout, /\.dashboard-content \{[^}]*max-width: 100%[^}]*min-width: 0/);
    assert.doesNotMatch(layout, /\.dashboard-content \{[^}]*overflow:\s*auto/);
    assert.match(layout, /\.dashboard-content__container \{[^}]*width: 100%[^}]*min-width: 0/);
    assert.match(global, /#root \{[^}]*width: 100%[^}]*max-width: 100%[^}]*min-width: 0/);
    assert.doesNotMatch(`${layout}\n${global}`, /overflow-x:\s*(hidden|clip)/);
  });
});
