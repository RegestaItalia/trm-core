// Shared locations of the e2e harness. The work folder (specs, prompts, logs) is git-ignored;
// set E2E_WORK to keep separate campaigns (or parallel runs) apart.
const path = require('path');

const CORE = path.resolve(__dirname, '..', '..');
const WORK = path.resolve(process.env.E2E_WORK || path.join(CORE, 'e2e', 'work'));

module.exports = {
    CORE,
    WORK,
    IPC: path.join(WORK, 'ipc'),
    LOGS: path.join(WORK, 'logs'),
    INPUTS: path.join(WORK, 'inputs')
};
