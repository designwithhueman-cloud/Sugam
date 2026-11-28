// Preload (node --import). Many tests call chromium.launch() with no channel, which needs Playwright's own browser download. When that is not
// installed, the test runner loads this file so those tests use the installed Google Chrome instead. It changes nothing when a channel is given.
import { chromium } from 'playwright';
const real = chromium.launch.bind(chromium);
chromium.launch = (o = {}) => real(o.channel || o.executablePath ? o : { ...o, channel: 'chrome' });
