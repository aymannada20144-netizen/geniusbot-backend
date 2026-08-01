'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('geniusbot-dashboard/src/pages/prices/PricesPage.tsx');
const form = read('geniusbot-dashboard/src/pages/prices/priceForm.ts');
const api = read('geniusbot-dashboard/src/api/pricesApi.ts');
const routes = read('geniusbot-dashboard/src/routes/AppRoutes.tsx');
const sidebar = read('geniusbot-dashboard/src/components/layout/AppSidebar.tsx');

describe('Prices dashboard', () => {
  test('registers the guarded route and permitted sidebar item', () => {
    assert.match(routes, /path="prices"/);
    assert.match(routes, /PricesPermissionGuard/);
    assert.match(sidebar, /\/dashboard\/prices/);
    assert.match(sidebar, /canViewPrices/);
  });

  test('uses only approved list, detail, create, update, and status APIs', () => {
    assert.match(api, /export async function listPrices/);
    assert.match(api, /export async function getPrice/);
    assert.match(api, /export async function createPrice/);
    assert.match(api, /export async function updatePrice/);
    assert.match(api, /export async function setPriceActive/);
    assert.doesNotMatch(api, /apiClient\.delete/);
  });

  test('renders loading, error, empty, and populated table states', () => {
    assert.match(page, /Loading prices/);
    assert.match(page, /Unable to load prices/);
    assert.match(page, /No prices found/);
    for (const heading of ['Service', 'Payment method', 'Insurance company', 'Insurance class', 'Price', 'Currency', 'Valid from', 'Valid to', 'Status', 'Actions']) {
      assert.match(page, new RegExp(`>${heading}<`));
    }
  });

  test('shows em dashes for cash insurance fields', () => {
    assert.match(page, /insurance_company_id[\s\S]*?: '—'/);
    assert.match(page, /insurance_class_id[\s\S]*?: '—'/);
  });

  test('provides practical service, method, company, and status filters', () => {
    assert.match(page, /Filter by service/);
    assert.match(page, /Filter by payment method/);
    assert.match(page, /Filter by insurance company/);
    assert.match(page, /Filter by status/);
  });

  test('cash payment changes clear incompatible insurance values', () => {
    assert.match(page, /insurance_company_id: insurance \? current\.insurance_company_id : null/);
    assert.match(page, /insurance_class_id: null/);
    assert.match(page, /\{isInsurance &&/);
  });

  test('insurance classes depend on the selected company', () => {
    assert.match(page, /item\.insurance_company_id === form\.insurance_company_id/);
    assert.match(form, /Insurance company is required/);
    assert.match(form, /Insurance class is required/);
  });

  test('validates non-negative price, currency, and date order', () => {
    assert.match(form, /Number\(form\.price\) < 0/);
    assert.match(form, /\^\[A-Z\]\{3\}\$/);
    assert.match(form, /form\.valid_to < form\.valid_from/);
  });

  test('supports create and update success with duplicate-submit prevention', () => {
    assert.match(page, /editing[\s\S]*?updatePrice[\s\S]*?: createPrice/);
    assert.match(page, /if \(save\.isPending\) return/);
    assert.match(page, /disabled=\{save\.isPending\}/);
    assert.match(page, /Price (updated|created) successfully/);
  });

  test('maps overlap and other backend price errors safely', () => {
    assert.match(form, /overlaps an existing active price/);
    assert.match(form, /does not belong to this clinic/);
    assert.match(form, /selected resource is inactive/);
    assert.match(form, /valid insurance company and class/);
    assert.doesNotMatch(page, /SQLSTATE|PostgreSQL/);
  });

  test('confirms activation changes and implements toast timing', () => {
    assert.match(page, /window\.confirm/);
    assert.match(page, /setPriceActive/);
    assert.match(page, /4000/);
    assert.match(page, /toast\?\.kind !== 'success'/);
    assert.match(page, />Reload</);
  });
});
