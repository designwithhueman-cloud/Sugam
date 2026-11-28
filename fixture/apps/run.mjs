// Starts Fixture A (correct) on :4301 and Fixture B (all defects) on :4302. Local only.
import { createApp, ALL_DEFECTS } from './customer-app.mjs';
const a = Number(process.env.FIXTURE_A_PORT ?? 4301), b = Number(process.env.FIXTURE_B_PORT ?? 4302);
createApp({ name: 'a' }).listen(a, '127.0.0.1', () => console.log(`Fixture A (correct)  http://127.0.0.1:${a}`));
createApp({ name: 'b', defects: ALL_DEFECTS }).listen(b, '127.0.0.1', () => console.log(`Fixture B (broken)   http://127.0.0.1:${b}`));
