const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..', '..')
const pagePath = path.join(root, 'geniusbot-dashboard', 'src', 'pages', 'master-data', 'DoctorWorkingHoursPage.tsx')
const cssPath = path.join(root, 'geniusbot-dashboard', 'src', 'pages', 'master-data', 'DoctorWorkingHoursPage.css')
const page = fs.readFileSync(pagePath, 'utf8')
const css = fs.readFileSync(cssPath, 'utf8')

test('renders one fixed accessible toast with success and persistent alert semantics', () => {
  assert.equal((page.match(/doctor-hours__toast doctor-hours__toast--/g) ?? []).length, 1)
  assert.match(page, /role=\{toastKind === 'success' \? 'status' : 'alert'\}/)
  assert.match(page, /aria-live=\{toastKind === 'success' \? 'polite' : 'assertive'\}/)
  assert.match(page, /aria-label="Close notification"/)
  assert.match(css, /\.doctor-hours__toast \{[\s\S]*position: fixed;/)
  assert.match(css, /z-index: 3000;/)
})

test('success toast expires after four seconds under fake timers', () => {
  assert.match(page, /SUCCESS_TOAST_DURATION_MS = 4_000/)
  assert.match(page, /if \(!successMessage\) return/)
  assert.match(page, /window\.setTimeout\([\s\S]*SUCCESS_TOAST_DURATION_MS/)
  assert.match(page, /window\.clearTimeout\(timer\)/)

  let visible = true
  const timers = []
  const fakeSetTimeout = (callback, milliseconds) => timers.push({ callback, milliseconds })
  fakeSetTimeout(() => { visible = false }, 4_000)
  for (const timer of timers.filter((item) => item.milliseconds <= 3_999)) timer.callback()
  assert.equal(visible, true)
  for (const timer of timers.filter((item) => item.milliseconds <= 4_000)) timer.callback()
  assert.equal(visible, false)
})

test('error toast persists and only version conflict displays Reload Schedule', () => {
  assert.match(page, /DOCTOR_WORKING_HOURS_VERSION_CONFLICT/)
  assert.match(page, /toastKind === 'conflict' && <button[\s\S]*Reload Schedule/)
  assert.doesNotMatch(page, /validationError[\s\S]{0,120}setTimeout/)
  assert.doesNotMatch(page, /validationError[\s\S]{0,120}setTimeout/)
})

test('reload updates cached version and editor only after a successful request', () => {
  const reload = page.match(/async function reloadSchedule\(\) \{[\s\S]*?\n  \}\n\n  return/)?.[0]
  assert.ok(reload)
  assert.match(reload, /if \(isReloading\) return/)
  assert.match(reload, /await getDoctorWorkingHours\(clinicId, doctorId\)/)
  assert.match(reload, /queryClient\.setQueryData/)
  assert.match(reload, /setPeriods\(editablePeriods\(latestSchedule\)\)/)
  assert.match(reload, /setEditedDoctorId\(doctorId\)/)
  assert.match(reload, /Unable to reload the latest schedule/)
  assert.match(page, /disabled=\{isReloading\}/)
})

test('ordinary save errors preserve editor data and duplicate saves are blocked', () => {
  assert.match(page, /function submit\(\) \{\s*if \(save\.isPending\) return/)
  assert.match(page, /disabled=\{save\.isPending \|\| isReloading\}/)
  assert.doesNotMatch(page, /onError:[\s\S]*setPeriods/)
  assert.match(page, /onMutate: \(\) => \{[\s\S]*setSuccessMessage\(''\)/)
  assert.match(page, /schedule\.data\?\.version \?\? ''/)
})

test('toast styles distinguish results and stay within the phone viewport', () => {
  assert.match(css, /\.doctor-hours__toast--success \{ background: #137333;/)
  assert.match(css, /\.doctor-hours__toast--error \{ background: #b3261e;/)
  assert.match(css, /\.doctor-hours__toast--conflict \{ background: #a64b00;/)
  assert.match(css, /font-size: 16px;/)
  assert.match(css, /box-shadow:/)
  assert.match(css, /width: min\(560px, calc\(100vw - 24px\)\)/)
  assert.match(css, /@media \(max-width: 760px\)/)
})
