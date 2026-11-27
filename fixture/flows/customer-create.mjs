// Milestone 1: the one hard-coded flow. Sign in, create AVARA_TEST_Customer, confirm, reload, confirm it is still there.
// The password below is the fixture's own test value; real credentials come with the vault (milestone 5).
import { TEST_USERS } from '../apps/customer-app.mjs';
export const CUSTOMER = 'AVARA_TEST_Customer';
const row = `[data-testid=customer-row]:has-text("${CUSTOMER}")`;
export const customerFlow = (base) => ({
  id: 'customer-create', name: 'Sign in and create a customer', startUrl: `${base}/login`,
  steps: [
    { id: 'fill_email', action: 'fill', selector: '#email', value: TEST_USERS.alice.email, expect: [{ type: 'visible', selector: '#email' }] },
    { id: 'fill_password', action: 'fill', selector: '#password', value: TEST_USERS.alice.password },
    { id: 'sign_in', action: 'click', selector: 'button[type=submit]', expect: [{ type: 'url_contains', value: '/dashboard' }, { type: 'text_contains', text: 'Customers' }] },
    { id: 'open_form', action: 'click', selector: '#add-customer', expect: [{ type: 'url_contains', value: '/customers/new' }, { type: 'visible', selector: '#name' }] },
    { id: 'fill_name', action: 'fill', selector: '#name', value: CUSTOMER },
    { id: 'save', action: 'click', selector: '#save' },
    { id: 'confirm_saved', action: 'wait_for', selector: '#toast', timeoutMs: 3000, expect: [{ type: 'text_contains', selector: '#toast', text: 'Customer saved' }] },
    { id: 'open_list', action: 'click', selector: 'a[href="/dashboard"]', expect: [{ type: 'url_contains', value: '/dashboard' }] },
    { id: 'verify_listed', action: 'wait_for', selector: row, timeoutMs: 1500, expect: [{ type: 'visible', selector: row }] },
    { id: 'reload', action: 'reload', expect: [{ type: 'url_contains', value: '/dashboard' }] },
    { id: 'verify_after_reload', action: 'wait_for', selector: row, timeoutMs: 1500, expect: [{ type: 'visible', selector: row }] },
  ],
});
export const EXPECTED_BROKEN_STEP = 'verify_listed';   // Fixture B shows the success toast, then the customer is missing from the list
